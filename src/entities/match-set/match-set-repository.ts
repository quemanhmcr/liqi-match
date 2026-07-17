import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  CreateSetInviteCommandV1,
  RequestSetJoinCommandV1,
  SetDiscoveryPageV1,
  SetInviteReceiptV1,
  SetJoinRequestReceiptV1,
} from '@/shared/contracts/core-v1';
import type {
  AcceptSetInviteCommandV2,
  AcceptSetJoinRequestCommandV2,
  CancelSetInviteCommandV2,
  CancelSetJoinRequestCommandV2,
  CloseMatchSetCommandV2,
  CreateMatchSetCommandV2,
  DeclineSetInviteCommandV2,
  InviteToSetCommandV2,
  LeaveSetCommandV2,
  MatchSetCommandReceiptV2,
  MatchSetDashboardV2,
  MatchSetSnapshotV2,
  RejectSetJoinRequestCommandV2,
  RemoveSetMemberCommandV2,
  ReopenMatchSetCommandV2,
  RequestSetJoinCommandV2,
  TransferSetOwnershipCommandV2,
  UpdateMatchSetCommandV2,
} from '@/shared/contracts/core-v2';

export interface MatchSetRepository {
  dashboard(session: AuthSession): Promise<MatchSetDashboardV2>;
  get(session: AuthSession, setId: string): Promise<MatchSetSnapshotV2 | null>;
  list(
    session: AuthSession,
    input: { cursor?: string | null; limit?: number },
  ): Promise<SetDiscoveryPageV1>;

  createSet(
    session: AuthSession,
    command: CreateMatchSetCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  updateSet(
    session: AuthSession,
    command: UpdateMatchSetCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  closeSet(
    session: AuthSession,
    command: CloseMatchSetCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  reopenSet(
    session: AuthSession,
    command: ReopenMatchSetCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  inviteToSet(
    session: AuthSession,
    command: InviteToSetCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  acceptInvite(
    session: AuthSession,
    command: AcceptSetInviteCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  declineInvite(
    session: AuthSession,
    command: DeclineSetInviteCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  cancelInvite(
    session: AuthSession,
    command: CancelSetInviteCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  requestJoinV2(
    session: AuthSession,
    command: RequestSetJoinCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  acceptJoinRequest(
    session: AuthSession,
    command: AcceptSetJoinRequestCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  rejectJoinRequest(
    session: AuthSession,
    command: RejectSetJoinRequestCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  cancelJoinRequest(
    session: AuthSession,
    command: CancelSetJoinRequestCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  leaveSet(
    session: AuthSession,
    command: LeaveSetCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  removeMember(
    session: AuthSession,
    command: RemoveSetMemberCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;
  transferOwnership(
    session: AuthSession,
    command: TransferSetOwnershipCommandV2,
  ): Promise<MatchSetCommandReceiptV2>;

  /** V1 compatibility surface retained for Discovery during the V2 cutover. */
  invite(
    session: AuthSession,
    command: CreateSetInviteCommandV1,
  ): Promise<SetInviteReceiptV1>;
  /** V1 compatibility surface retained for Discovery during the V2 cutover. */
  requestJoin(
    session: AuthSession,
    command: RequestSetJoinCommandV1,
  ): Promise<SetJoinRequestReceiptV1>;
}
