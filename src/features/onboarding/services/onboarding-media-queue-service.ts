import type { ImagePickerAsset } from 'expo-image-picker';

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
  if (item.slot === 'avatar') return item.status === 'associated';
  return item.status === 'uploaded' || item.status === 'associated';
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
    (item) => !isOnboardingMediaItemComplete(item),
  );
  const failed: OnboardingMediaQueueItem[] = [];
  let completed = 0;

  for (const candidate of candidates) {
    const index = items.findIndex((item) => item.localId === candidate.localId);
    if (index < 0) continue;

    const uploading: OnboardingMediaQueueItem = {
      ...candidate,
      error: undefined,
      status: 'uploading',
    };
    items[index] = uploading;
    await input.onItemChange(uploading);
    input.onProgress?.({
      completed,
      current: uploading,
      total: candidates.length,
    });

    try {
      const uploaded = await uploadOnboardingMediaQueueItem(
        input.session,
        uploading,
      );
      items[index] = uploaded;
      completed += 1;
      await input.onItemChange(uploaded);
      input.onProgress?.({
        completed,
        current: uploaded,
        total: candidates.length,
      });
    } catch (error) {
      const errored: OnboardingMediaQueueItem = {
        ...uploading,
        error: errorMessage(error),
        status: 'error',
      };
      items[index] = errored;
      failed.push(errored);
      await input.onItemChange(errored);
    }
  }

  return { failed, items };
}

export async function uploadOnboardingMediaQueueItem(
  session: AuthSession,
  item: OnboardingMediaQueueItem,
): Promise<OnboardingMediaQueueItem> {
  if (isOnboardingMediaItemComplete(item)) return item;

  if (item.uploadedAssetId) {
    if (item.slot !== 'avatar') {
      return { ...item, error: undefined, status: 'uploaded' };
    }
    await associateAvatar(session, item.uploadedAssetId);
    return { ...item, error: undefined, status: 'associated' };
  }

  const asset: LocalImageAsset = {
    fileName: item.fileName,
    fileSize: item.fileSize,
    height: item.height,
    mimeType: item.mimeType,
    uri: item.localUri,
    width: item.width,
  };
  const uploaded = await uploadSingleQueueAsset(session, item.slot, asset);
  const uploadedItem: OnboardingMediaQueueItem = {
    ...item,
    error: undefined,
    status: 'uploaded',
    uploadedAssetId: uploaded.assetId,
    uploadedObjectKey: uploaded.objectKey,
  };

  if (item.slot !== 'avatar') return uploadedItem;
  await associateAvatar(session, uploaded.assetId);
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
