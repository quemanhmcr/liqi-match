import type { AuthSession } from '@/shared/auth/auth-service';
import {
  countUploadableMedia,
  type LocalImageAsset,
  type UploadProgress,
  type UploadedMediaAsset,
  uploadMediaBatch,
} from '@/shared/services/media-upload';
import { supabaseRest } from '@/shared/services/supabase-rest';

export type OnboardingMediaDraft = {
  avatar?: LocalImageAsset | null;
  cover?: LocalImageAsset | null;
  wallItems: LocalImageAsset[];
};

export { type LocalImageAsset, type UploadProgress };

export function countUploadableOnboardingMedia(input: OnboardingMediaDraft) {
  return countUploadableMedia(input);
}

/** Onboarding owns the workflow-specific avatar association after upload. */
export async function uploadOnboardingMedia(
  session: AuthSession,
  input: OnboardingMediaDraft,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadedMediaAsset[]> {
  const uploaded = await uploadMediaBatch(session, input, onProgress);
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
