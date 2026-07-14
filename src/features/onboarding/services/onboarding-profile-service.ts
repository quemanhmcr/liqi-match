import {
  adaptCompletedProfileToLegacyOnboardingPayload,
  type LegacyProfileAdapterIssue,
} from '@/entities/player-profile';
import {
  AuthError,
  synchronizeAuthSession,
  type AuthSession,
} from '@/shared/auth/auth-service';
import {
  CompletePlayerOnboardingCommandV1Schema,
  CompletePlayerOnboardingResultV1Schema,
  type CompletePlayerOnboardingResultV1,
} from '@/shared/contracts/core-v1';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { OnboardingDraftData } from '../model/persisted-onboarding-draft';

export type CompleteOnboardingProfileResult = {
  completed: true;
  profileVersion: number;
  repeated: boolean;
  session: AuthSession;
  warnings: LegacyProfileAdapterIssue[];
};

const EXPECTED_INITIAL_PROFILE_VERSION = 0;

/**
 * Executes the sole authoritative onboarding transition.
 *
 * The legacy payload is an expand/migrate transport only. Postgres persists it,
 * reads canonical activation fields back, verifies them, and alone transitions
 * the player lifecycle to active.
 */
export async function completeOnboardingProfile(
  fallbackSession: AuthSession,
  draft: OnboardingDraftData,
): Promise<CompleteOnboardingProfileResult> {
  if (
    fallbackSession.lifecycle &&
    !['registered', 'onboarding', 'active'].includes(
      fallbackSession.lifecycle.state,
    )
  ) {
    throw new AuthError(
      `Không thể hoàn tất onboarding từ lifecycle ${fallbackSession.lifecycle.state}.`,
      'invalid_lifecycle_transition',
    );
  }

  const adapted = adaptCompletedProfileToLegacyOnboardingPayload(draft.profile);
  if (!adapted.ok) {
    const message = adapted.errors
      .map((issue) => `${issue.path || 'profile'}: ${issue.message}`)
      .join('\n');
    throw new Error(message || 'Dữ liệu onboarding canonical chưa hoàn tất.');
  }

  const commandSession = await requireAuthoritativeSession(fallbackSession);
  const principal = commandSession.principal!;
  const lifecycle = commandSession.lifecycle!;
  if (
    lifecycle.state !== 'registered' &&
    lifecycle.state !== 'onboarding' &&
    lifecycle.state !== 'active'
  ) {
    throw new AuthError(
      `Không thể hoàn tất onboarding từ lifecycle ${lifecycle.state}.`,
      'invalid_lifecycle_transition',
    );
  }

  const command = CompletePlayerOnboardingCommandV1Schema.parse({
    expectedProfileVersion: EXPECTED_INITIAL_PROFILE_VERSION,
    idempotencyKey: `onboarding.complete.${principal.accountId}`,
    legacyProfilePayload: adapted.payload,
    profile: {
      displayName: adapted.payload.display_name,
      favoriteHeroSlugs: adapted.payload.heroes.map((hero) => hero.slug),
      gameHandle: adapted.payload.handle,
      rankSlug: adapted.payload.rank_slug,
      roleSlugs: adapted.payload.role_slugs,
      timezone: adapted.payload.timezone,
    },
  });

  const rawResult = await supabaseRest<unknown>(
    'rpc/complete_player_onboarding_v1',
    { body: { command }, method: 'POST', session: commandSession },
  );
  const result = parseCompletionResult(rawResult, commandSession);

  return {
    completed: true,
    profileVersion: result.profileVersion,
    repeated: result.repeated,
    // Keep the fresh request token for optional media work. Navigation publishes
    // active lifecycle only after the local media queue finishes.
    session: commandSession,
    warnings: [...adapted.warnings],
  };
}

async function requireAuthoritativeSession(
  fallbackSession: AuthSession,
): Promise<AuthSession> {
  const synchronized = await synchronizeAuthSession();
  const session = synchronized ?? fallbackSession;
  if (
    !session.principal ||
    !session.lifecycle ||
    session.principal.accountId !== session.user.id ||
    session.principal.playerId !== session.lifecycle.playerId
  ) {
    throw new AuthError(
      'Session chưa có canonical AccountId → PlayerId mapping.',
      'principal_account_mismatch',
    );
  }
  return session;
}

function parseCompletionResult(
  value: unknown,
  session: AuthSession,
): CompletePlayerOnboardingResultV1 {
  const result = CompletePlayerOnboardingResultV1Schema.parse(value);
  if (
    result.principal.accountId !== session.user.id ||
    result.principal.playerId !== session.principal?.playerId ||
    result.lifecycle.playerId !== session.principal?.playerId ||
    result.lifecycle.state !== 'active' ||
    !result.lifecycle.discoverable ||
    !result.lifecycle.messagingAllowed
  ) {
    throw new AuthError(
      'Onboarding response không khớp authoritative identity/lifecycle.',
      'invalid_lifecycle_transition',
    );
  }
  return result;
}
