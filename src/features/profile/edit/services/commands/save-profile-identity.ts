import { GenderIdSchema } from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  PlayerProfileStatusV1Schema,
  UpdatePlayerProfileIdentityCommandV1Schema,
  UpdatePlayerProfileIdentityResultV1Schema,
  type PlayerProfileIdentitySnapshotV1,
} from '@/shared/contracts/core-v1';
import {
  SupabaseRestError,
  supabaseRest,
} from '@/shared/services/supabase-rest';

import type { ProfileEditIdentity } from '../../model/profile-edit-model';
import { ProfileEditCommandError } from './profile-edit-command-error';
import {
  normalizeBio,
  normalizeDisplayName,
  normalizeOptionalNumber,
  normalizeRating,
} from './profile-edit-command-utils';

export type SaveProfileIdentityResult = {
  profileVersion: number;
};

export async function saveProfileIdentity(input: {
  baseline: ProfileEditIdentity;
  canonicalProfileId: PlayerProfileIdentitySnapshotV1['profileId'];
  current: ProfileEditIdentity;
  expectedProfileVersion: number;
  playerId: PlayerProfileIdentitySnapshotV1['playerId'];
  session: AuthSession;
}): Promise<SaveProfileIdentityResult> {
  const accountId = input.session.principal?.accountId ?? input.session.user.id;
  if (
    accountId !== input.session.user.id ||
    (input.session.principal?.playerId &&
      input.session.principal.playerId !== input.playerId)
  ) {
    throw new ProfileEditCommandError(
      'Session không khớp canonical AccountId → PlayerId mapping.',
      { code: 'profile_identity_mismatch', retryable: false },
    );
  }

  const command = UpdatePlayerProfileIdentityCommandV1Schema.parse({
    expectedProfileVersion: input.expectedProfileVersion,
    idempotencyKey: `profile.identity.${accountId}.v${input.expectedProfileVersion}`,
    identity: {
      bio: normalizeBio(input.current.bio),
      displayName: normalizeDisplayName(input.current.displayName),
      genderId:
        input.current.genderId === null
          ? null
          : GenderIdSchema.parse(input.current.genderId),
      stats: normalizeIdentityStats(input.baseline),
      status: normalizeIdentityStatus(input.baseline, input.current),
    },
  });

  try {
    const rawResult = await supabaseRest<unknown>(
      'rpc/update_player_profile_identity_v1',
      {
        body: { command },
        method: 'POST',
        session: input.session,
      },
    );
    const result = UpdatePlayerProfileIdentityResultV1Schema.parse(rawResult);
    if (
      result.playerId !== input.playerId ||
      result.profileId !== input.canonicalProfileId ||
      result.profileVersion !== input.expectedProfileVersion + 1
    ) {
      throw new ProfileEditCommandError(
        'Profile identity response không khớp canonical identity/version.',
        { code: 'profile_identity_response_mismatch', retryable: false },
      );
    }
    return { profileVersion: result.profileVersion };
  } catch (error) {
    if (
      error instanceof SupabaseRestError &&
      error.code === 'profile_version_conflict'
    ) {
      const actualVersion = numericDetail(error.details ?? {}, 'actualVersion');
      throw new ProfileEditCommandError(
        actualVersion === null
          ? 'Hồ sơ đã thay đổi trên phiên khác. Hãy tải lại trước khi lưu.'
          : `Hồ sơ đã ở phiên bản ${actualVersion}. Hãy tải lại trước khi lưu.`,
        {
          cause: error,
          code: error.code,
          retryable: false,
        },
      );
    }
    throw error;
  }
}

function normalizeIdentityStats(baseline: ProfileEditIdentity) {
  const stats = baseline.stats ?? {};
  return {
    matches: normalizeOptionalNumber(stats.matches, 99_999) ?? 0,
    rating: normalizeRating(stats.rating) ?? 0,
    reputation: normalizeOptionalNumber(stats.reputation, 100) ?? 0,
    winRate: normalizeOptionalNumber(stats.winRate, 100) ?? 0,
  };
}

function normalizeIdentityStatus(
  baseline: ProfileEditIdentity,
  current: ProfileEditIdentity,
) {
  const candidate = current.status ?? baseline.status ?? null;
  return candidate === null
    ? null
    : PlayerProfileStatusV1Schema.parse(candidate);
}

function numericDetail(
  details: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
