import { MediaStagingItemSchema } from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { uploadProfileMediaAsset } from '@/shared/services/media-upload';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { profileMediaUrl } from '../../../services/profile-service';
import type {
  ProfileEditForm,
  ProfileEditMediaSlot,
  ProfileEditStagedMedia,
} from '../../model/profile-edit-model';
import { ProfileEditCommandError } from './profile-edit-command-error';
import { patchProfileMediaSummary } from './profile-edit-media-summary';

export async function uploadStagedProfileMedia(input: {
  session: AuthSession;
  staged: ProfileEditStagedMedia;
}): Promise<ProfileEditStagedMedia> {
  if (input.staged.uploadedAssetId !== null) return input.staged;
  const uploaded = await uploadProfileMediaAsset(input.session, {
    asset: input.staged.asset,
    slot: input.staged.slot,
  });
  return parseProfileMediaItem({
    ...input.staged,
    failure: null,
    status: 'uploaded',
    uploadedAssetId: uploaded.assetId,
    uploadedObjectKey: uploaded.objectKey,
  });
}

export async function saveProfileMediaAssociation(input: {
  baseline: ProfileEditForm['media'];
  current: ProfileEditForm['media'];
  hasHabitRecord: boolean;
  profileId: string;
  session: AuthSession;
}): Promise<readonly ProfileEditMediaSlot[]> {
  const associated: ProfileEditMediaSlot[] = [];
  const avatarChanged =
    input.baseline.avatarMediaId !== input.current.avatarMediaId;
  const coverChanged =
    input.baseline.coverMediaId !== input.current.coverMediaId;

  if (avatarChanged) {
    await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(input.profileId)}`,
      {
        body: { avatar_media_id: input.current.avatarMediaId ?? null },
        method: 'PATCH',
        prefer: 'return=minimal',
        session: input.session,
      },
    );
    associated.push('avatar');
  }

  if (!coverChanged) return associated;
  if (!input.hasHabitRecord) {
    throw new ProfileEditCommandError(
      'Ảnh đã upload nhưng chưa thể liên kết làm ảnh nền vì profile_habits chưa tồn tại.',
      {
        associatedMediaSlots: associated,
        partiallySaved:
          associated.length > 0 || Boolean(input.current.coverMediaId),
      },
    );
  }

  try {
    await patchProfileMediaSummary(
      input.session,
      input.profileId,
      (summary) => ({
        ...summary,
        cover_media_id: input.current.coverMediaId ?? null,
      }),
    );
    associated.push('cover');
    return associated;
  } catch (error) {
    throw new ProfileEditCommandError(
      'Ảnh đã upload nhưng chưa liên kết hoàn tất. Có thể retry association mà không cần chọn lại ảnh.',
      {
        associatedMediaSlots: associated,
        cause: error,
        partiallySaved:
          associated.length > 0 || Boolean(input.current.coverMediaId),
      },
    );
  }
}

export function withUploadedMedia(
  form: ProfileEditForm,
  uploaded: ProfileEditStagedMedia,
): ProfileEditForm {
  const assetId = uploaded.uploadedAssetId;
  if (!assetId) return form;
  const media = { ...form.media, staged: { ...form.media.staged } };
  media.staged[uploaded.slot] = uploaded;
  const url = profileMediaUrl(assetId);
  if (uploaded.slot === 'avatar') {
    media.avatarMediaId = assetId;
    media.avatarUrl = url;
  } else {
    media.coverMediaId = assetId;
    media.coverUrl = url;
  }
  return { ...form, media };
}

function parseProfileMediaItem(value: unknown): ProfileEditStagedMedia {
  const item = MediaStagingItemSchema.parse(value);
  if (item.slot !== 'avatar' && item.slot !== 'cover') {
    throw new Error('Profile Edit chỉ hỗ trợ avatar hoặc cover media.');
  }
  return item as ProfileEditStagedMedia;
}
