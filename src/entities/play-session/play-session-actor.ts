import type { AuthSession } from '@/shared/auth/auth-service';

import { PlaySessionDomainError } from './play-session-error';
import type { PlaySessionActorContext } from './play-session-repository';

export function resolvePlaySessionActor(
  session: AuthSession | null,
): PlaySessionActorContext {
  if (!session?.principal?.playerId || !session.lifecycle) {
    throw new PlaySessionDomainError(
      'unauthenticated',
      'An authoritative player session is required.',
    );
  }
  if (
    session.principal.playerId !== session.lifecycle.playerId ||
    session.lifecycle.state !== 'active'
  ) {
    throw new PlaySessionDomainError(
      'lifecycle_not_active',
      'Player lifecycle is not active for Party/Session operations.',
      { state: session.lifecycle.state },
    );
  }
  return { lifecycle: session.lifecycle, principal: session.principal };
}
