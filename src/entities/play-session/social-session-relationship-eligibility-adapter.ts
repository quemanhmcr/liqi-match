import type { PlayerId } from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import type { RelationshipCapabilityReader } from '@/entities/social-relationship';

import { PlaySessionDomainError } from './play-session-error';
import type { SessionRelationshipEligibilityProvider } from './play-session-repository';

export type CurrentAuthSessionProvider = () => AuthSession | null;

/**
 * Consumer adapter only. Social relationship and privacy semantics remain owned
 * by Senior 1's RelationshipCapabilityReader.
 */
export class SocialSessionRelationshipEligibilityAdapter implements SessionRelationshipEligibilityProvider {
  constructor(
    private readonly relationshipReader: RelationshipCapabilityReader,
    private readonly getCurrentSession: CurrentAuthSessionProvider,
  ) {}

  async getInviteEligibility(
    actorPlayerId: PlayerId,
    targetPlayerId: PlayerId,
  ) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new PlaySessionDomainError(
        'unauthenticated',
        'Authentication is required to evaluate Session invitation eligibility.',
      );
    }
    if (
      session.principal?.playerId !== actorPlayerId ||
      session.lifecycle?.playerId !== actorPlayerId ||
      session.lifecycle.state !== 'active'
    ) {
      throw new PlaySessionDomainError(
        'forbidden',
        'The relationship capability actor does not match the canonical Session actor.',
      );
    }

    const relationship = await this.relationshipReader.getRelationship(
      session,
      targetPlayerId,
    );
    const blocked = relationship.capabilities.blocked;
    const allowed =
      !blocked && relationship.capabilities.canInviteToSession === true;

    return {
      allowed,
      blocked,
      reasonCodes: allowed
        ? []
        : [blocked ? 'relationship_blocked' : 'session_invite_policy_denied'],
    };
  }
}
