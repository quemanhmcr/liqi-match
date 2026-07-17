import type { ImagePickerAsset } from 'expo-image-picker';

import {
  updateProfileWallMediaSlot,
  profileMediaSummaryRecord,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  type LocalImageAsset,
  type UploadedMediaAsset,
  uploadMediaBatch,
} from '@/shared/services/media-upload';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type {
  OnboardingMediaQueueItem,
  OnboardingMediaSlot,
} from '../model/onboarding-media-state';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES_BY_SLOT: Record<OnboardingMediaSlot, number> = {
  avatar: 5 * 1024 * 1024,
  cover: 8 * 1024 * 1024,
  wall: 8 * 1024 * 1024,
};

export type MediaQueueProgress = {
  completed: number;
  current: OnboardingMediaQueueItem;
  total: number;
};

export type MediaQueueRunResult = {
  failed: OnboardingMediaQueueItem[];
  items: OnboardingMediaQueueItem[];
};

export function validateOnboardingMediaSelection(
  asset: ImagePickerAsset,
  slot: OnboardingMediaSlot,
): LocalImageAsset {
  if (!asset.uri) throw new Error('Không thể đọc đường dẫn ảnh đã chọn.');
  if (asset.width <= 0 || asset.height <= 0) {
    throw new Error('Ảnh không có kích thước hợp lệ. Vui lòng chọn ảnh khác.');
  }

  const mimeType = normalizedMimeType(
    asset.mimeType,
    asset.fileName ?? asset.uri,
  );
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(
      'Định dạng ảnh chưa được hỗ trợ. Hãy dùng JPG, PNG hoặc WebP.',
    );
  }

  if (
    typeof asset.fileSize === 'number' &&
    asset.fileSize > MAX_BYTES_BY_SLOT[slot]
  ) {
    const maxMb = MAX_BYTES_BY_SLOT[slot] / (1024 * 1024);
    throw new Error(
      `Ảnh quá lớn. Kích thước tối đa cho mục này là ${maxMb} MB.`,
    );
  }

  return {
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    height: asset.height,
    mimeType,
    uri: asset.uri,
    width: asset.width,
  };
}

export function isOnboardingMediaItemComplete(item: OnboardingMediaQueueItem) {
  return item.status === 'associated';
}

export function hasPendingOnboardingMedia(items: OnboardingMediaQueueItem[]) {
  return items.some((item) => !isOnboardingMediaItemComplete(item));
}

export async function runOnboardingMediaQueue(input: {
  items: OnboardingMediaQueueItem[];
  onItemChange: (item: OnboardingMediaQueueItem) => Promise<void>;
  onProgress?: (progress: MediaQueueProgress) => void;
  session: AuthSession;
}): Promise<MediaQueueRunResult> {
  const items = [...input.items];
  const candidates = items.filter(
    (item) =>
      !isOnboardingMediaItemComplete(item) &&
      (item.status !== 'failed' || item.retry.retryable),
  );
  const failed: OnboardingMediaQueueItem[] = [];
  let completed = 0;

  for (const candidate of candidates) {
    const index = items.findIndex((item) => item.localId === candidate.localId);
    if (index < 0) continue;

    const attemptAt = new Date().toISOString();
    const uploading: OnboardingMediaQueueItem = {
      ...candidate,
      failure: null,
      retry: {
        attemptCount: candidate.retry.attemptCount + 1,
        lastAttemptAt: attemptAt,
        retryable: true,
      },
      status: 'uploading',
    };
    items[index] = uploading;
    await input.onItemChange(uploading);
    input.onProgress?.({
      completed,
      current: uploading,
      total: candidates.length,
    });

    let latest = uploading;
    try {
      const uploaded = await uploadOnboardingMediaQueueItem(
        input.session,
        uploading,
        async (intermediate) => {
          latest = intermediate;
          items[index] = intermediate;
          await input.onItemChange(intermediate);
        },
      );
      items[index] = uploaded;
      completed += 1;
      if (uploaded !== latest) await input.onItemChange(uploaded);
      input.onProgress?.({
        completed,
        current: uploaded,
        total: candidates.length,
      });
    } catch (error) {
      const failedItem: OnboardingMediaQueueItem = {
        ...latest,
        failure: {
          code: latest.uploadedAssetId ? 'association_failed' : 'upload_failed',
          message: errorMessage(error),
        },
        retry: { ...latest.retry, retryable: true },
        status: 'failed',
      };
      items[index] = failedItem;
      failed.push(failedItem);
      await input.onItemChange(failedItem);
    }
  }

  return { failed, items };
}

export async function uploadOnboardingMediaQueueItem(
  session: AuthSession,
  item: OnboardingMediaQueueItem,
  onUploaded?: (item: OnboardingMediaQueueItem) => Promise<void>,
): Promise<OnboardingMediaQueueItem> {
  if (isOnboardingMediaItemComplete(item)) return item;

  if (item.uploadedAssetId) {
    await associateProfileMedia(session, item, item.uploadedAssetId);
    return { ...item, failure: null, status: 'associated' };
  }

  const asset: LocalImageAsset = {
    fileName: item.asset.fileName,
    fileSize: item.asset.fileSize,
    height: item.asset.height,
    mimeType: item.asset.mimeType,
    uri: item.asset.uri,
    width: item.asset.width,
  };
  const uploaded = await uploadSingleQueueAsset(session, item.slot, asset);
  const uploadedItem: OnboardingMediaQueueItem = {
    ...item,
    failure: null,
    status: 'uploaded',
    uploadedAssetId: uploaded.assetId,
    uploadedObjectKey: uploaded.objectKey,
  };

  await onUploaded?.(uploadedItem);
  await associateProfileMedia(session, item, uploaded.assetId);
  return { ...uploadedItem, status: 'associated' };
}

async function uploadSingleQueueAsset(
  session: AuthSession,
  slot: OnboardingMediaSlot,
  asset: LocalImageAsset,
) {
  const input = {
    avatar: slot === 'avatar' ? asset : null,
    cover: slot === 'cover' ? asset : null,
    wallItems: slot === 'wall' ? [asset] : [],
  };
  const [uploaded] = await uploadMediaBatch(session, input);
  if (!uploaded) throw new Error('Không nhận được kết quả upload ảnh.');
  return uploaded satisfies UploadedMediaAsset;
}

async function associateProfileMedia(
  session: AuthSession,
  item: OnboardingMediaQueueItem,
  assetId: string,
) {
  if (item.slot === 'avatar') {
    await associateAvatar(session, assetId);
    return;
  }

  const rows = await supabaseRest<{ media_summary: unknown | null }[]>(
    `profile_habits?select=media_summary&profile_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { session },
  );
  if (!rows[0]) {
    throw new Error(
      'profile_habits chưa sẵn sàng để liên kết media onboarding.',
    );
  }
  const summary = profileMediaSummaryRecord(rows[0].media_summary);
  const mediaSummary =
    item.slot === 'cover'
      ? { ...summary, cover_media_id: assetId }
      : updateProfileWallMediaSlot({
          assetId,
          position: item.position,
          summary,
        });
  await supabaseRest(
    `profile_habits?profile_id=eq.${encodeURIComponent(session.user.id)}`,
    {
      body: { media_summary: mediaSummary },
      method: 'PATCH',
      prefer: 'return=minimal',
      session,
    },
  );
}

async function associateAvatar(session: AuthSession, assetId: string) {
  await supabaseRest(`profiles?id=eq.${session.user.id}`, {
    body: { avatar_media_id: assetId },
    method: 'PATCH',
    prefer: 'return=minimal',
    session,
  });
}

function normalizedMimeType(
  mimeType: string | null | undefined,
  fileNameOrUri: string,
) {
  const normalized = mimeType?.toLowerCase();
  if (normalized) return normalized;
  const clean = fileNameOrUri.split('?')[0]?.toLowerCase() ?? '';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể upload ảnh. Vui lòng thử lại.';
}
