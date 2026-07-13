import {
  MediaLocalAssetSchema,
  MediaStagingItemSchema,
  type MediaStagingFailure,
} from '@/entities/player-profile';
import type {
  ImagePickerAsset,
  ImagePickerErrorResult,
  ImagePickerResult,
} from 'expo-image-picker';

import type {
  ProfileEditLocalAsset,
  ProfileEditMediaSlot,
  ProfileEditStagedMedia,
} from './profile-edit-model';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytesBySlot: Record<ProfileEditMediaSlot, number> = {
  avatar: 5 * 1024 * 1024,
  cover: 8 * 1024 * 1024,
};

export function stageProfileMedia(
  slot: ProfileEditMediaSlot,
  asset: ProfileEditLocalAsset,
): ProfileEditStagedMedia {
  const canonicalAsset = MediaLocalAssetSchema.parse(normalizeAsset(asset));
  const failure = validateProfileMediaAsset(canonicalAsset, slot);
  return MediaStagingItemSchema.parse({
    asset: canonicalAsset,
    cleanup: emptyCleanup(),
    failure,
    localId: createLocalId(slot),
    persistedAt: null,
    position: 0,
    retry: emptyRetry(),
    slot,
    status: failure ? 'failed' : 'ready',
    uploadedAssetId: null,
    uploadedObjectKey: null,
  }) as ProfileEditStagedMedia;
}

export function validateStagedProfileMedia(
  staged: Pick<ProfileEditStagedMedia, 'asset' | 'slot'>,
): string | undefined {
  return validateProfileMediaAsset(staged.asset, staged.slot)?.message;
}

export function imagePickerAssetToProfileLocalAsset(
  asset: ImagePickerAsset,
): ProfileEditLocalAsset {
  return MediaLocalAssetSchema.parse(
    normalizeAsset({
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      height: asset.height,
      mimeType: normalizeMimeType(asset.mimeType, asset.fileName ?? asset.uri),
      uri: asset.uri,
      width: asset.width,
    }),
  );
}

export function firstPickedProfileImage(
  result: ImagePickerErrorResult | ImagePickerResult | null,
): ImagePickerAsset | undefined {
  if (!result || !('canceled' in result) || result.canceled) return undefined;
  const asset = result.assets?.[0];
  return asset?.uri ? asset : undefined;
}

function validateProfileMediaAsset(
  asset: ProfileEditLocalAsset,
  slot: ProfileEditMediaSlot,
): MediaStagingFailure | null {
  const mimeType = normalizeMimeType(
    asset.mimeType,
    asset.fileName ?? asset.uri,
  );
  if (!mimeType || !allowedMimeTypes.has(mimeType)) {
    return {
      code: 'unsupported_media_type',
      message: 'Định dạng ảnh chưa được hỗ trợ. Hãy dùng JPG, PNG hoặc WebP.',
    };
  }
  if (asset.fileSize !== null && asset.fileSize > maxBytesBySlot[slot]) {
    return {
      code: 'media_too_large',
      message:
        slot === 'avatar'
          ? 'Ảnh đại diện vượt quá 5 MB.'
          : 'Ảnh nền vượt quá 8 MB.',
    };
  }
  return null;
}

function normalizeAsset(
  asset: Partial<ProfileEditLocalAsset> & { uri: string },
): ProfileEditLocalAsset {
  return {
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    height: asset.height ?? null,
    mimeType:
      normalizeMimeType(asset.mimeType, asset.fileName ?? asset.uri) ?? null,
    uri: asset.uri,
    width: asset.width ?? null,
  };
}

function normalizeMimeType(
  value: string | null | undefined,
  fileNameOrUri: string,
) {
  const normalized = value?.trim().toLowerCase();
  if (normalized) return normalized;
  const clean = fileNameOrUri.split('?')[0]?.toLowerCase() ?? '';
  if (/\.jpe?g$/.test(clean)) return 'image/jpeg';
  if (/\.png$/.test(clean)) return 'image/png';
  if (/\.webp$/.test(clean)) return 'image/webp';
  return undefined;
}

function createLocalId(slot: ProfileEditMediaSlot) {
  return `${slot}:0:${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function emptyRetry() {
  return {
    attemptCount: 0,
    lastAttemptAt: null,
    retryable: true,
  } as const;
}

function emptyCleanup() {
  return {
    completedAt: null,
    failure: null,
    lastAttemptAt: null,
    requestedAt: null,
  } as const;
}
