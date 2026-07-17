import type { ImagePickerAsset } from 'expo-image-picker';

import {
  PROFILE_WALL_MEDIA_LIMIT,
  parseProfileWallMediaSlots,
  updateProfileWallMediaSlot,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  uploadMediaBatch,
  type LocalImageAsset,
} from '@/shared/services/media-upload';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { patchProfileMediaSummary } from '../edit/services/commands/profile-edit-media-summary';
import { profileMediaUrl } from './profile-service';

type ProfileGalleryRow = { media_summary: unknown | null };

export type ProfileGallerySnapshot = Readonly<{
  profileId: string;
  slots: readonly (string | null)[];
  urls: readonly (string | null)[];
}>;

export async function fetchProfileGallery(
  session: AuthSession,
): Promise<ProfileGallerySnapshot> {
  const rows = await supabaseRest<ProfileGalleryRow[]>(
    `profile_habits?select=media_summary&profile_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { session },
  );
  if (!rows[0]) {
    throw new Error('Hồ sơ chưa sẵn sàng để liên kết tường ảnh.');
  }
  const slots = parseProfileWallMediaSlots(rows[0].media_summary);
  return {
    profileId: session.user.id,
    slots,
    urls: slots.map((assetId) => profileMediaUrl(assetId) ?? null),
  };
}

export async function uploadProfileGalleryAsset(
  session: AuthSession,
  asset: ImagePickerAsset,
) {
  const [uploaded] = await uploadMediaBatch(session, {
    avatar: null,
    cover: null,
    wallItems: [imagePickerAssetToLocalImage(asset)],
  });
  if (!uploaded || uploaded.slot !== 'wall') {
    throw new Error('Không nhận được asset tường ảnh sau upload.');
  }
  return uploaded;
}

export async function associateProfileGalleryAsset(input: {
  assetId: string | null;
  position: number;
  profileId: string;
  session: AuthSession;
}) {
  assertPosition(input.position);
  await patchProfileMediaSummary(input.session, input.profileId, (summary) =>
    updateProfileWallMediaSlot({
      assetId: input.assetId,
      position: input.position,
      summary,
    }),
  );
}

export function imagePickerAssetToLocalImage(
  asset: ImagePickerAsset,
): LocalImageAsset {
  if (!asset.uri) throw new Error('Không thể đọc ảnh đã chọn.');
  return {
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    height: asset.height,
    mimeType: normalizeMimeType(asset.mimeType, asset.fileName ?? asset.uri),
    uri: asset.uri,
    width: asset.width,
  };
}

function assertPosition(position: number) {
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= PROFILE_WALL_MEDIA_LIMIT
  ) {
    throw new Error('Vị trí tường ảnh không hợp lệ.');
  }
}

function normalizeMimeType(
  mimeType: string | null | undefined,
  fileNameOrUri: string,
) {
  const normalized = mimeType?.trim().toLowerCase();
  if (normalized) return normalized;
  const clean = fileNameOrUri.split('?')[0]?.toLowerCase() ?? '';
  if (/\.jpe?g$/.test(clean)) return 'image/jpeg';
  if (/\.png$/.test(clean)) return 'image/png';
  if (/\.webp$/.test(clean)) return 'image/webp';
  return null;
}
