import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { supabaseRest } from '@/shared/services/supabase-rest';

export type OnboardingMediaSlot = 'avatar' | 'cover' | 'wall';
export type UploadMediaPurpose = 'personal_avatar' | 'game_profile';

export type LocalImageAsset = {
  fileName?: string | null;
  fileSize?: number | null;
  height?: number | null;
  mimeType?: string | null;
  uri: string;
  width?: number | null;
};

export type UploadableOnboardingMedia = {
  avatar?: LocalImageAsset | null;
  cover?: LocalImageAsset | null;
  wallItems: LocalImageAsset[];
};

export type UploadedMediaAsset = {
  assetId: string;
  objectKey: string;
  purpose: UploadMediaPurpose;
  slot: OnboardingMediaSlot;
};

export type UploadProgress = {
  completed: number;
  total: number;
  currentSlot: OnboardingMediaSlot;
};

type CreateUploadResponse = {
  assetId: string;
  objectKey: string;
  uploadHeaders: Record<string, string>;
  uploadUrl: string;
};

type FinalizeUploadResponse = {
  assetId: string;
  status: 'pending' | 'uploaded' | 'ready' | string;
};

type UploadPlanItem = {
  asset: LocalImageAsset;
  purpose: UploadMediaPurpose;
  slot: OnboardingMediaSlot;
};

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MAX_BYTES_BY_PURPOSE: Record<UploadMediaPurpose, number> = {
  game_profile: 8 * 1024 * 1024,
  personal_avatar: 5 * 1024 * 1024,
};

export function countUploadableOnboardingMedia(
  input: UploadableOnboardingMedia,
) {
  return buildUploadPlan(input).length;
}

export async function uploadOnboardingMedia(
  session: AuthSession,
  input: UploadableOnboardingMedia,
  onProgress?: (progress: UploadProgress) => void,
) {
  const plan = buildUploadPlan(input);
  const uploaded: UploadedMediaAsset[] = [];

  for (const [index, item] of plan.entries()) {
    onProgress?.({
      completed: index,
      currentSlot: item.slot,
      total: plan.length,
    });

    uploaded.push(await uploadSingleMedia(session, item));

    onProgress?.({
      completed: index + 1,
      currentSlot: item.slot,
      total: plan.length,
    });
  }

  const avatarUpload = uploaded.find((asset) => asset.slot === 'avatar');
  if (avatarUpload) {
    await supabaseRest(`profiles?id=eq.${session.user.id}`, {
      body: { avatar_media_id: avatarUpload.assetId },
      method: 'PATCH',
      prefer: 'return=minimal',
      session,
    });
  }

  return uploaded;
}

function buildUploadPlan(input: UploadableOnboardingMedia): UploadPlanItem[] {
  return [
    ...(input.avatar
      ? [
          {
            asset: input.avatar,
            purpose: 'personal_avatar' as const,
            slot: 'avatar' as const,
          },
        ]
      : []),
    ...(input.cover
      ? [
          {
            asset: input.cover,
            purpose: 'game_profile' as const,
            slot: 'cover' as const,
          },
        ]
      : []),
    ...input.wallItems.map((asset) => ({
      asset,
      purpose: 'game_profile' as const,
      slot: 'wall' as const,
    })),
  ];
}

async function uploadSingleMedia(
  session: AuthSession,
  item: UploadPlanItem,
): Promise<UploadedMediaAsset> {
  const blob = await readLocalImageBlob(item.asset.uri);
  const mimeType = resolveMimeType(item.asset, blob);
  const byteSize = blob.size;

  validateImageUpload({ byteSize, mimeType, purpose: item.purpose });

  const upload = await callMediaFunction<CreateUploadResponse>(
    'media-create-upload',
    session,
    {
      byteSize,
      height: item.asset.height ?? undefined,
      mimeType,
      originalFilename: item.asset.fileName ?? fileNameFromUri(item.asset.uri),
      purpose: item.purpose,
      width: item.asset.width ?? undefined,
    },
  );

  const putResponse = await fetch(upload.uploadUrl, {
    body: blob as unknown as BodyInit,
    headers: upload.uploadHeaders,
    method: 'PUT',
  });

  if (!putResponse.ok) {
    throw new Error('Không thể upload ảnh lên R2. Vui lòng thử lại.');
  }

  const finalized = await callMediaFunction<FinalizeUploadResponse>(
    'media-finalize-upload',
    session,
    { assetId: upload.assetId },
  );

  if (finalized.status !== 'uploaded' && finalized.status !== 'ready') {
    throw new Error(
      'Ảnh đã upload nhưng chưa được xác nhận. Vui lòng thử lại.',
    );
  }

  return {
    assetId: finalized.assetId,
    objectKey: upload.objectKey,
    purpose: item.purpose,
    slot: item.slot,
  };
}

async function readLocalImageBlob(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Không thể đọc ảnh đã chọn. Vui lòng chọn lại ảnh.');
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Ảnh đã chọn không có dữ liệu. Vui lòng chọn lại ảnh.');
  }

  return blob;
}

function resolveMimeType(asset: LocalImageAsset, blob: Blob) {
  return (
    normalizeMimeType(asset.mimeType) ??
    normalizeMimeType(blob.type) ??
    mimeTypeFromUri(asset.uri) ??
    'image/jpeg'
  );
}

function normalizeMimeType(value: string | null | undefined) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return ALLOWED_MIME_TYPES.has(normalized) ? normalized : undefined;
}

function mimeTypeFromUri(uri: string) {
  const extension = fileNameFromUri(uri).split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return undefined;
}

function validateImageUpload(input: {
  byteSize: number;
  mimeType: string;
  purpose: UploadMediaPurpose;
}) {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(
      'Định dạng ảnh chưa được hỗ trợ. Hãy dùng JPG, PNG hoặc WebP.',
    );
  }

  if (input.byteSize > MAX_BYTES_BY_PURPOSE[input.purpose]) {
    throw new Error('Ảnh quá lớn. Hãy chọn ảnh nhẹ hơn rồi thử lại.');
  }
}

function fileNameFromUri(uri: string) {
  const cleanUri = uri.split('?')[0] ?? uri;
  const name = cleanUri.split('/').pop();
  return name?.trim() || 'liqi-upload.jpg';
}

async function callMediaFunction<T>(
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) {
  const response = await fetch(functionUrl(functionName), {
    body: JSON.stringify(body),
    headers: {
      apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${session.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw await toMediaFunctionError(response);
  }

  return (await response.json()) as T;
}

function functionUrl(functionName: string) {
  return new URL(
    `/functions/v1/${functionName}`,
    env.EXPO_PUBLIC_SUPABASE_URL,
  ).toString();
}

async function toMediaFunctionError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    return new Error(
      body.error?.message ??
        `Media upload failed with status ${response.status}`,
    );
  } catch {
    return new Error(`Media upload failed with status ${response.status}`);
  }
}
