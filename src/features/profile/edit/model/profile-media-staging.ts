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
  const staged: ProfileEditStagedMedia = {
    asset: { ...asset },
    slot,
    status: 'selected',
  };
  const error = validateStagedProfileMedia(staged);
  return error
    ? { ...staged, error, status: 'failed' }
    : { ...staged, status: 'ready' };
}

export function validateStagedProfileMedia(
  staged: Pick<ProfileEditStagedMedia, 'asset' | 'slot'>,
): string | undefined {
  const { asset, slot } = staged;
  if (!asset.uri.trim()) return 'Không đọc được ảnh đã chọn.';
  const mimeType = normalizeMimeType(asset.mimeType, asset.uri);
  if (mimeType && !allowedMimeTypes.has(mimeType)) {
    return 'Định dạng ảnh chưa được hỗ trợ. Hãy dùng JPG, PNG hoặc WebP.';
  }
  if (
    typeof asset.fileSize === 'number' &&
    asset.fileSize > maxBytesBySlot[slot]
  ) {
    return slot === 'avatar'
      ? 'Ảnh đại diện vượt quá 5 MB.'
      : 'Ảnh nền vượt quá 8 MB.';
  }
  if (
    typeof asset.width === 'number' &&
    typeof asset.height === 'number' &&
    (asset.width <= 0 || asset.height <= 0)
  ) {
    return 'Ảnh đã chọn không có kích thước hợp lệ.';
  }
  return undefined;
}

export function imagePickerAssetToProfileLocalAsset(
  asset: ImagePickerAsset,
): ProfileEditLocalAsset {
  return {
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    height: asset.height,
    mimeType: asset.mimeType,
    uri: asset.uri,
    width: asset.width,
  };
}

export function firstPickedProfileImage(
  result: ImagePickerErrorResult | ImagePickerResult | null,
): ImagePickerAsset | undefined {
  if (!result || !('canceled' in result) || result.canceled) return undefined;
  const asset = result.assets?.[0];
  return asset?.uri ? asset : undefined;
}

function normalizeMimeType(
  value: string | null | undefined,
  uri: string,
): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized) return normalized;
  const clean = uri.split('?')[0]?.toLowerCase() ?? '';
  if (/\.jpe?g$/.test(clean)) return 'image/jpeg';
  if (/\.png$/.test(clean)) return 'image/png';
  if (/\.webp$/.test(clean)) return 'image/webp';
  return undefined;
}
