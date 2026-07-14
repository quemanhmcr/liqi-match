import type { AuthSession } from '@/shared/auth/auth-service';
import { AccountIdSchema, PlayerIdSchema } from '@/shared/contracts/core-v1';

import type { VerifiedConversationActorV2 } from './conversation-v2-provider';
import { ConversationV2ProviderError } from './conversation-v2-error';

export function resolveVerifiedConversationActorV2(
  session: AuthSession | null,
): VerifiedConversationActorV2 {
  if (!session?.principal || !session.lifecycle) {
    throw new ConversationV2ProviderError(
      'unauthenticated',
      'An authenticated canonical player session is required.',
      false,
    );
  }
  if (session.principal.playerId !== session.lifecycle.playerId) {
    throw new ConversationV2ProviderError(
      'unauthenticated',
      'Session principal and lifecycle player identity do not match.',
      false,
    );
  }
  if (
    session.lifecycle.state !== 'active' ||
    !session.lifecycle.messagingAllowed
  ) {
    throw new ConversationV2ProviderError(
      'player_lifecycle_forbidden',
      'Player lifecycle does not allow messaging.',
      false,
      {
        lifecycleState: session.lifecycle.state,
        lifecycleVersion: session.lifecycle.version,
      },
    );
  }

  return {
    accountId: AccountIdSchema.parse(session.principal.accountId),
    playerId: PlayerIdSchema.parse(session.principal.playerId),
    lifecycleVersion: session.lifecycle.version,
    messagingAllowed: true,
  };
}
