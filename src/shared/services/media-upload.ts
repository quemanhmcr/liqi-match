import * as FileSystem from 'expo-file-system/legacy';

import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';

export type MediaSlot = 'avatar' | 'chat' | 'cover' | 'wall';
export type UploadMediaPurpose =
  'personal_avatar' | 'game_profile' | 'chat_attachment';

export type LocalImageAsset = {
  fileName?: string | null;
  fileSize?: number | null;
  height?: number | null;
  mimeType?: string | null;
  uri: string;
  width?: number | null;
};

export type UploadableMedia = {
  avatar?: LocalImageAsset | null;
  cover?: LocalImageAsset | null;
  wallItems: LocalImageAsset[];
};

export type UploadedMediaAsset = {
  assetId: string;
  objectKey: string;
  purpose: UploadMediaPurpose;
  slot: MediaSlot;
};

export type UploadProgress = {
  completed: number;
  total: number;
  currentSlot: MediaSlot;
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
  slot: MediaSlot;
};

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MAX_BYTES_BY_PURPOSE: Record<UploadMediaPurpose, number> = {
  chat_attachment: 12 * 1024 * 1024,
  game_profile: 8 * 1024 * 1024,
  personal_avatar: 5 * 1024 * 1024,
};

export function countUploadableMedia(input: UploadableMedia) {
  return buildUploadPlan(input).length;
}

export async function uploadProfileMediaAsset(
  session: AuthSession,
  input: { asset: LocalImageAsset; slot: 'avatar' | 'cover' },
): Promise<UploadedMediaAsset> {
  return uploadSingleMedia(session, {
    asset: input.asset,
    purpose: input.slot === 'avatar' ? 'personal_avatar' : 'game_profile',
    slot: input.slot,
  });
}

export async function uploadChatAttachment(
  session: AuthSession,
  asset: LocalImageAsset,
): Promise<UploadedMediaAsset> {
  return uploadSingleMedia(session, {
    asset,
    purpose: 'chat_attachment',
    slot: 'chat',
  });
}

/** Uploads media only. Domain-specific profile writes stay in their feature. */
export async function uploadMediaBatch(
  session: AuthSession,
  input: UploadableMedia,
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

  return uploaded;
}

function buildUploadPlan(input: UploadableMedia): UploadPlanItem[] {
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
  const localFile = await readLocalImageFile(item.asset.uri);
  const mimeType = resolveMimeType(item.asset, localFile);
  const byteSize = localFile.size;

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

  await uploadLocalFileToR2({
    headers: upload.uploadHeaders,
    mimeType,
    uploadUrl: upload.uploadUrl,
    uri: item.asset.uri,
  });

  const finalized = await callMediaFunction<FinalizeUploadResponse>(
    'media-finalize-upload',
    session,
    { assetId: upload.assetId },
  );

  if (finalized.status !== 'uploaded' && finalized.status !== 'ready') {
    throw new Error(
      'áº¢nh Ä‘Ã£ upload nhÆ°ng chÆ°a Ä‘Æ°á»£c xÃ¡c nháº­n. Vui lÃ²ng thá»­ láº¡i.',
    );
  }

  return {
    assetId: finalized.assetId,
    objectKey: upload.objectKey,
    purpose: item.purpose,
    slot: item.slot,
  };
}

type LocalImageFile = {
  size: number;
  type?: string | null;
};

async function readLocalImageFile(uri: string): Promise<LocalImageFile> {
  const info = await FileSystem.getInfoAsync(uri);

  if (!info.exists) {
    throw new Error(
      'KhÃ´ng thá»ƒ Ä‘á»c áº£nh Ä‘Ã£ chá»n. Vui lÃ²ng chá»n láº¡i áº£nh.',
    );
  }

  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (!size) {
    throw new Error(
      'áº¢nh Ä‘Ã£ chá»n khÃ´ng cÃ³ dá»¯ liá»‡u. Vui lÃ²ng chá»n láº¡i áº£nh.',
    );
  }

  return { size };
}

async function uploadLocalFileToR2(input: {
  headers: Record<string, string>;
  mimeType: string;
  uploadUrl: string;
  uri: string;
}) {
  const response = await FileSystem.uploadAsync(input.uploadUrl, input.uri, {
    headers: input.headers,
    httpMethod: 'PUT',
    mimeType: input.mimeType,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      'KhÃ´ng thá»ƒ upload áº£nh lÃªn R2. Vui lÃ²ng thá»­ láº¡i.',
    );
  }
}

function resolveMimeType(asset: LocalImageAsset, file: LocalImageFile) {
  return (
    normalizeMimeType(asset.mimeType) ??
    normalizeMimeType(file.type) ??
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
      'Äá»‹nh dáº¡ng áº£nh chÆ°a Ä‘Æ°á»£c há»— trá»£. HÃ£y dÃ¹ng JPG, PNG hoáº·c WebP.',
    );
  }

  if (input.byteSize > MAX_BYTES_BY_PURPOSE[input.purpose]) {
    throw new Error(
      'áº¢nh quÃ¡ lá»›n. HÃ£y chá»n áº£nh nháº¹ hÆ¡n rá»“i thá»­ láº¡i.',
    );
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
