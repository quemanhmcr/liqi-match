import type {
  AuthenticatedPrincipalV1,
  CoreErrorCodeV1,
  PlayerLifecycleSnapshotV1,
} from '../../../../contracts/core-v1';
import {
  isMessagingAllowed,
  isPrincipalExpired,
} from '../../../../contracts/core-v1';

export type MessagingAuthorizationFailureCode = Extract<
  CoreErrorCodeV1,
  | 'lifecycle_not_active'
  | 'player_deleting'
  | 'player_deleted'
  | 'player_not_found'
  | 'player_suspended'
  | 'session_expired'
  | 'unauthenticated'
>;

export class MessagingAuthorizationError extends Error {
  constructor(
    readonly code: MessagingAuthorizationFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'MessagingAuthorizationError';
  }
}

export type AuthorizedMessagingActor = Readonly<{
  accountId: AuthenticatedPrincipalV1['accountId'];
  playerId: PlayerLifecycleSnapshotV1['playerId'];
  profileId: PlayerLifecycleSnapshotV1['profileId'];
  sessionId: AuthenticatedPrincipalV1['sessionId'];
}>;

export function authorizeMessagingActor(input: {
  lifecycle: PlayerLifecycleSnapshotV1 | null;
  now: string;
  principal: AuthenticatedPrincipalV1 | null;
}): AuthorizedMessagingActor {
  const principal = input.principal;
  if (!principal) {
    throw new MessagingAuthorizationError(
      'unauthenticated',
      'Authentication is required for messaging.',
    );
  }

  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime()) || isPrincipalExpired(principal, now)) {
    throw new MessagingAuthorizationError(
      'session_expired',
      'The authenticated session has expired.',
    );
  }

  if (!principal.playerId || !input.lifecycle) {
    throw new MessagingAuthorizationError(
      'player_not_found',
      'The authenticated account is not mapped to a player.',
    );
  }

  const lifecycle = input.lifecycle;
  if (
    lifecycle.accountId !== principal.accountId ||
    lifecycle.playerId !== principal.playerId
  ) {
    throw new MessagingAuthorizationError(
      'player_not_found',
      'The lifecycle snapshot does not belong to the authenticated principal.',
    );
  }

  if (!isMessagingAllowed(lifecycle)) {
    throw lifecycleFailure(lifecycle.state);
  }

  return Object.freeze({
    accountId: principal.accountId,
    playerId: lifecycle.playerId,
    profileId: lifecycle.profileId,
    sessionId: principal.sessionId,
  });
}

function lifecycleFailure(
  state: PlayerLifecycleSnapshotV1['state'],
): MessagingAuthorizationError {
  switch (state) {
    case 'suspended':
      return new MessagingAuthorizationError(
        'player_suspended',
        'Suspended players cannot use messaging.',
      );
    case 'deleting':
      return new MessagingAuthorizationError(
        'player_deleting',
        'Players pending deletion cannot use messaging.',
      );
    case 'deleted':
      return new MessagingAuthorizationError(
        'player_deleted',
        'Deleted players cannot use messaging.',
      );
    default:
      return new MessagingAuthorizationError(
        'lifecycle_not_active',
        'Messaging is only available to active players.',
      );
  }
}
