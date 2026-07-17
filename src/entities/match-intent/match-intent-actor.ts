import type { AuthSession } from '@/shared/auth/auth-service';
import type { PlayerId } from '@/shared/contracts/core-v1';

export type ActiveMatchIntentActor = Readonly<{
  accountId: string;
  playerId: PlayerId;
}>;

export function resolveActiveMatchIntentActor(
  session: AuthSession,
): ActiveMatchIntentActor {
  const principal = session.principal;
  const lifecycle = session.lifecycle;
  if (!principal?.playerId || !lifecycle) {
    throw matchIntentActorError(
      'unauthenticated',
      'Match Intent requires a canonical authenticated player.',
    );
  }
  if (
    principal.accountId !== session.user.id ||
    principal.playerId !== lifecycle.playerId
  ) {
    throw matchIntentActorError(
      'lifecycle_not_active',
      'Match Intent principal and lifecycle identities do not match.',
    );
  }
  if (lifecycle.state !== 'active') {
    throw matchIntentActorError(
      'lifecycle_not_active',
      'The player lifecycle must be active before enabling Match Intent.',
      { state: lifecycle.state },
    );
  }
  return { accountId: principal.accountId, playerId: principal.playerId };
}

function matchIntentActorError(
  code: 'lifecycle_not_active' | 'unauthenticated',
  message: string,
  details: Readonly<Record<string, unknown>> = {},
) {
  return Object.assign(new Error(message), {
    code,
    details,
    retryable: false,
  });
}
