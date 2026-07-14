import {
  normalizeRecurringAvailability,
  type RecurringAvailability,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  UpdatePlayerProfileAvailabilityCommandV1Schema,
  UpdatePlayerProfileAvailabilityResultV1Schema,
  type PlayerProfileAvailabilitySnapshotV1,
} from '@/shared/contracts/core-v1';
import {
  SupabaseRestError,
  supabaseRest,
} from '@/shared/services/supabase-rest';

import { ProfileEditCommandError } from './profile-edit-command-error';

export type SaveProfileAvailabilityResult = {
  profileVersion: number;
};

export async function saveProfileAvailability(input: {
  canonicalProfileId: PlayerProfileAvailabilitySnapshotV1['profileId'];
  current: RecurringAvailability | null;
  expectedProfileVersion: number;
  playerId: PlayerProfileAvailabilitySnapshotV1['playerId'];
  session: AuthSession;
}): Promise<SaveProfileAvailabilityResult> {
  const accountId = input.session.principal?.accountId ?? input.session.user.id;
  if (
    accountId !== input.session.user.id ||
    (input.session.principal?.playerId &&
      input.session.principal.playerId !== input.playerId)
  ) {
    throw new ProfileEditCommandError(
      'Session không khớp canonical AccountId → PlayerId mapping.',
      { code: 'profile_availability_mismatch', retryable: false },
    );
  }

  const command = UpdatePlayerProfileAvailabilityCommandV1Schema.parse({
    availability:
      input.current === null
        ? null
        : normalizeRecurringAvailability(input.current),
    expectedProfileVersion: input.expectedProfileVersion,
    idempotencyKey: `profile.availability.${accountId}.v${input.expectedProfileVersion}`,
  });

  try {
    const rawResult = await supabaseRest<unknown>(
      'rpc/update_player_profile_availability_v1',
      {
        body: { command },
        method: 'POST',
        session: input.session,
      },
    );
    const result =
      UpdatePlayerProfileAvailabilityResultV1Schema.parse(rawResult);
    if (
      result.playerId !== input.playerId ||
      result.profileId !== input.canonicalProfileId ||
      result.profileVersion !== input.expectedProfileVersion + 1
    ) {
      throw new ProfileEditCommandError(
        'Profile availability response không khớp canonical identity/version.',
        { code: 'profile_availability_response_mismatch', retryable: false },
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

function numericDetail(
  details: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
