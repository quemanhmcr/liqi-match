import type {
  AcceptSessionInviteCommandV2,
  AssignSessionRoleCommandV2,
  CancelSessionCommandV2,
  CoreV2Event,
  CreateSessionFromMatchCommandV2,
  CreateSessionFromSetCommandV2,
  InviteToSessionCommandV2,
  LeaveSessionCommandV2,
  OpenReadyCheckCommandV2,
  PlaySessionCapabilitiesV2,
  PlaySessionMembershipProjectionV2,
  PlaySessionCommandReceiptV2,
  PlaySessionSnapshotV2,
  PlaySessionId,
  ProposeSessionCompletionCommandV2,
  RemoveSessionMemberCommandV2,
  RespondReadyCheckCommandV2,
  ScheduleSessionCommandV2,
  StartSessionCommandV2,
} from '@/shared/contracts/core-v2';
import type {
  AuthenticatedPrincipalV1,
  ConversationId,
  MatchId,
  PlayerId,
  PlayerLifecycleSnapshotV1,
  SetId,
} from '@/shared/contracts/core-v1';

export type PlaySessionActorContext = Readonly<{
  lifecycle: PlayerLifecycleSnapshotV1;
  principal: AuthenticatedPrincipalV1;
}>;

export interface PlaySessionRepository {
  get(
    actor: PlaySessionActorContext,
    sessionId: PlaySessionId,
  ): Promise<PlaySessionSnapshotV2>;
  listCurrent(actor: PlaySessionActorContext): Promise<PlaySessionSnapshotV2[]>;
}

export interface PlaySessionCommandService {
  createFromMatch(
    actor: PlaySessionActorContext,
    command: CreateSessionFromMatchCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  createFromSet(
    actor: PlaySessionActorContext,
    command: CreateSessionFromSetCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  invite(
    actor: PlaySessionActorContext,
    command: InviteToSessionCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  acceptInvite(
    actor: PlaySessionActorContext,
    command: AcceptSessionInviteCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  leave(
    actor: PlaySessionActorContext,
    command: LeaveSessionCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  removeMember(
    actor: PlaySessionActorContext,
    command: RemoveSessionMemberCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  assignRole(
    actor: PlaySessionActorContext,
    command: AssignSessionRoleCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  openReadyCheck(
    actor: PlaySessionActorContext,
    command: OpenReadyCheckCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  respondReadyCheck(
    actor: PlaySessionActorContext,
    command: RespondReadyCheckCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  schedule(
    actor: PlaySessionActorContext,
    command: ScheduleSessionCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  start(
    actor: PlaySessionActorContext,
    command: StartSessionCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  proposeCompletion(
    actor: PlaySessionActorContext,
    command: ProposeSessionCompletionCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
  cancel(
    actor: PlaySessionActorContext,
    command: CancelSessionCommandV2,
  ): Promise<PlaySessionCommandReceiptV2>;
}

export interface PlaySessionCapabilitiesProvider {
  getCapabilities(
    actor: PlaySessionActorContext,
    sessionId: PlaySessionId,
  ): Promise<PlaySessionCapabilitiesV2>;
}

export interface SessionMembershipProvider {
  getMembership(
    sessionId: PlaySessionId,
  ): Promise<PlaySessionMembershipProjectionV2>;
}

export type SessionSourceSnapshot = Readonly<{
  capacity: number;
  memberPlayerIds: readonly PlayerId[];
  ownerPlayerId: PlayerId;
  version: number;
}>;

export interface PlaySessionSourceProvider {
  getMatchParticipantIds(matchId: MatchId): Promise<readonly PlayerId[]>;
  getSetSnapshot(setId: SetId): Promise<SessionSourceSnapshot>;
}

export type SessionInviteEligibility = Readonly<{
  allowed: boolean;
  blocked: boolean;
  reasonCodes: readonly string[];
}>;

/** Consumer seam for Senior 1. This port does not define relationship semantics. */
export interface SessionRelationshipEligibilityProvider {
  getInviteEligibility(
    actorPlayerId: PlayerId,
    targetPlayerId: PlayerId,
  ): Promise<SessionInviteEligibility>;
}

export interface SessionParticipantLifecycleProvider {
  assertActive(playerIds: readonly PlayerId[]): Promise<void>;
}

export type SessionConversationProvisioningReceipt = Readonly<{
  conversationId: ConversationId;
  membership: PlaySessionMembershipProjectionV2;
  sourceAggregateVersion: number;
}>;

export type SessionConversationSyncInput = Readonly<{
  correlationId: string;
  membership: PlaySessionMembershipProjectionV2;
  sourceAggregateVersion: number;
  title: string;
}>;

/** Consumer seam for Senior 3. All calls occur after the Session commit. */
export interface SessionConversationProvisioner {
  provision(
    input: SessionConversationSyncInput,
  ): Promise<SessionConversationProvisioningReceipt>;
  reconcile(
    input: SessionConversationSyncInput & { conversationId: ConversationId },
  ): Promise<SessionConversationProvisioningReceipt>;
}

export interface PlaySessionMaintenanceService {
  expireReadyChecks(correlationId: string): Promise<number>;
  reconcileCommunication(
    sessionId: PlaySessionId,
    correlationId: string,
  ): Promise<void>;
}

export interface PlaySessionEventLog {
  listEvents(sessionId?: PlaySessionId): readonly CoreV2Event[];
}
