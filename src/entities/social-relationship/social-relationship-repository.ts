import type {
  AcceptFriendshipCommandV2,
  BlockedPlayerListPageV2,
  BlockPlayerCommandV2,
  CancelFriendshipCommandV2,
  DeclineFriendshipCommandV2,
  FriendshipListPageV2,
  MutePlayerCommandV2,
  PlayerPrivacyCommandReceiptV2,
  PlayerPrivacySettingsV2,
  RemoveFriendshipCommandV2,
  ReportMessageCommandV2,
  ReportPlayerCommandV2,
  ReportReceiptV2,
  RequestFriendshipCommandV2,
  SocialRelationshipCommandReceiptV2,
  SocialRelationshipListPageV2,
  SocialRelationshipSnapshotV2,
  TrustVisibilityDecisionV2,
  UnblockPlayerCommandV2,
  UnmutePlayerCommandV2,
  UpdatePlayerPrivacyCommandV2,
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

export interface SocialRelationshipCommandService {
  requestFriendship(
    session: AuthSession,
    command: RequestFriendshipCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  acceptFriendship(
    session: AuthSession,
    command: AcceptFriendshipCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  declineFriendship(
    session: AuthSession,
    command: DeclineFriendshipCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  cancelFriendship(
    session: AuthSession,
    command: CancelFriendshipCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  removeFriendship(
    session: AuthSession,
    command: RemoveFriendshipCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
}

export interface PlayerSafetyCommandService {
  blockPlayer(
    session: AuthSession,
    command: BlockPlayerCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  unblockPlayer(
    session: AuthSession,
    command: UnblockPlayerCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  mutePlayer(
    session: AuthSession,
    command: MutePlayerCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  unmutePlayer(
    session: AuthSession,
    command: UnmutePlayerCommandV2,
  ): Promise<SocialRelationshipCommandReceiptV2>;
  reportPlayer(
    session: AuthSession,
    command: ReportPlayerCommandV2,
  ): Promise<ReportReceiptV2>;
  reportMessage(
    session: AuthSession,
    command: ReportMessageCommandV2,
  ): Promise<ReportReceiptV2>;
}

export interface PlayerPrivacyProvider {
  getPrivacy(session: AuthSession): Promise<PlayerPrivacySettingsV2>;
  updatePrivacy(
    session: AuthSession,
    command: UpdatePlayerPrivacyCommandV2,
  ): Promise<PlayerPrivacyCommandReceiptV2>;
  getTrustVisibility(
    session: AuthSession,
    targetPlayerId: string,
  ): Promise<TrustVisibilityDecisionV2>;
}

export interface SocialRelationshipRepository extends RelationshipCapabilitiesProvider {
  listBlockedPlayers(
    session: AuthSession,
    input?: Readonly<{ afterPlayerId?: string | null; limit?: number }>,
  ): Promise<BlockedPlayerListPageV2>;
  listFriendships(
    session: AuthSession,
    input?: Readonly<{ afterPlayerId?: string | null; limit?: number }>,
  ): Promise<FriendshipListPageV2>;
  listRelationships(
    session: AuthSession,
    input?: Readonly<{ afterPlayerId?: string | null; limit?: number }>,
  ): Promise<SocialRelationshipListPageV2>;
}
