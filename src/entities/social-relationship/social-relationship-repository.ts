import type {
  FriendshipListPageV2,
  SocialRelationshipSnapshotV2,
  TrustVisibilityDecisionV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';

export interface RelationshipCapabilitiesProvider {
  getRelationship(
    session: AuthSession,
    targetPlayerId: string,
  ): Promise<SocialRelationshipSnapshotV2>;
}

/** Structural compatibility seam used by trust/session/conversation consumers. */
export type RelationshipCapabilityReader = RelationshipCapabilitiesProvider;

export interface PlayerPrivacyProvider {
  getTrustVisibility(
    session: AuthSession,
    targetPlayerId: string,
  ): Promise<TrustVisibilityDecisionV2>;
}

export interface SocialRelationshipRepository
  extends RelationshipCapabilitiesProvider, PlayerPrivacyProvider {
  listFriendships(
    session: AuthSession,
    input?: Readonly<{ afterPlayerId?: string | null; limit?: number }>,
  ): Promise<FriendshipListPageV2>;
}
