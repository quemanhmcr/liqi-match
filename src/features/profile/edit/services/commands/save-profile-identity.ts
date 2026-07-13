import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { ProfileStats } from '../../../services/profile-service';
import type { ProfileEditIdentity } from '../../model/profile-edit-model';
import { ProfileEditCommandError } from './profile-edit-command-error';
import {
  normalizeBio,
  normalizeDisplayName,
  normalizeOptionalNumber,
  normalizeRating,
  recordValue,
  stableKey,
  stripUndefined,
} from './profile-edit-command-utils';
import { patchProfileMediaSummary } from './profile-edit-media-summary';

export async function saveProfileIdentity(input: {
  baseline: ProfileEditIdentity;
  current: ProfileEditIdentity;
  profileId: string;
  session: AuthSession;
}) {
  const profilePatch: Record<string, unknown> = {};
  if (input.baseline.displayName !== input.current.displayName) {
    profilePatch.display_name = normalizeDisplayName(input.current.displayName);
  }
  if (input.baseline.bio !== input.current.bio) {
    const bio = normalizeBio(input.current.bio);
    profilePatch.bio = bio || null;
  }

  let profileSaved = false;
  if (Object.keys(profilePatch).length) {
    await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(input.profileId)}`,
      {
        body: profilePatch,
        method: 'PATCH',
        prefer: 'return=minimal',
        session: input.session,
      },
    );
    profileSaved = true;
  }

  const genderChanged = input.baseline.gender !== input.current.gender;
  const statusChanged = input.baseline.status !== input.current.status;
  const statsChanged =
    stableKey(input.baseline.stats) !== stableKey(input.current.stats);
  if (!genderChanged && !statusChanged && !statsChanged) return;

  try {
    await patchProfileMediaSummary(
      input.session,
      input.profileId,
      (summary) => {
        const next = { ...summary };
        if (genderChanged) {
          next.profile_basics = {
            ...recordValue(summary.profile_basics),
            gender: input.current.gender ?? null,
          };
        }
        if (statusChanged) next.profile_status = input.current.status ?? null;
        if (statsChanged) {
          next.profile_stats = mergeStatsSummary(
            recordValue(summary.profile_stats),
            input.current.stats,
          );
        }
        return next;
      },
    );
  } catch (error) {
    throw new ProfileEditCommandError(
      'Thông tin cơ bản đã lưu một phần nhưng trạng thái hiển thị chưa được cập nhật.',
      { cause: error, partiallySaved: profileSaved },
    );
  }
}

function mergeStatsSummary(
  current: Record<string, unknown>,
  stats: Partial<ProfileStats> | undefined,
) {
  if (!stats) return {};
  return stripUndefined({
    ...current,
    matches: normalizeOptionalNumber(stats.matches, 99999),
    rating: normalizeRating(stats.rating),
    reputation: normalizeOptionalNumber(stats.reputation, 100),
    win_rate: normalizeOptionalNumber(stats.winRate, 100),
  });
}
