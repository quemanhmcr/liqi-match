import type { AuthSession } from '@/shared/auth/auth-service';
import {
  CreateSetInviteCommandV1Schema,
  RequestSetJoinCommandV1Schema,
  SetDiscoveryPageV1Schema,
  SetDiscoveryQueryV1Schema,
  SetInviteReceiptV1Schema,
  SetJoinRequestReceiptV1Schema,
} from '@/shared/contracts/core-v1';
import {
  AcceptSetInviteCommandV2Schema,
  AcceptSetJoinRequestCommandV2Schema,
  CancelSetInviteCommandV2Schema,
  CancelSetJoinRequestCommandV2Schema,
  CloseMatchSetCommandV2Schema,
  CreateMatchSetCommandV2Schema,
  DeclineSetInviteCommandV2Schema,
  InviteToSetCommandV2Schema,
  LeaveSetCommandV2Schema,
  MatchSetCommandReceiptV2Schema,
  MatchSetDashboardV2Schema,
  MatchSetSnapshotV2Schema,
  RejectSetJoinRequestCommandV2Schema,
  RemoveSetMemberCommandV2Schema,
  ReopenMatchSetCommandV2Schema,
  RequestSetJoinCommandV2Schema,
  TransferSetOwnershipCommandV2Schema,
  UpdateMatchSetCommandV2Schema,
  type MatchSetCommandReceiptV2,
} from '@/shared/contracts/core-v2';
import { prepareCoreV2CommandMetadata } from '@/shared/core-v2';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { MatchSetRepository } from './match-set-repository';

export type MatchSetRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) => Promise<unknown>;

export type MatchSetMetadataFactory = (
  expectedVersion: number,
) => ReturnType<typeof prepareCoreV2CommandMetadata>;

export class SupabaseMatchSetRepository implements MatchSetRepository {
  constructor(
    private readonly rpc: MatchSetRpcTransport = callRpc,
    private readonly metadataFactory: MatchSetMetadataFactory = defaultMetadataFactory,
  ) {}

  async dashboard(session: AuthSession) {
    return MatchSetDashboardV2Schema.parse(
      await this.rpc('get_match_set_dashboard_v2', session, {}),
    );
  }

  async get(session: AuthSession, setId: string) {
    return MatchSetSnapshotV2Schema.parse(
      await this.rpc('get_match_set_v2', session, { p_set_id: setId }),
    );
  }

  async list(
    session: AuthSession,
    input: { cursor?: string | null; limit?: number },
  ) {
    const query = SetDiscoveryQueryV1Schema.parse(input);
    return SetDiscoveryPageV1Schema.parse(
      await this.rpc('list_discovery_sets_v1', session, {
        p_cursor: query.cursor ?? null,
        p_limit: query.limit,
      }),
    );
  }

  async createSet(session: AuthSession, command: unknown) {
    const input = CreateMatchSetCommandV2Schema.parse(command);
    return this.command(session, 'create_match_set_v2', input, {
      p_capacity: input.capacity,
      p_expires_at: input.expiresAt,
      p_intent_kind: input.intentKind,
      p_title: input.title,
    });
  }

  async updateSet(session: AuthSession, command: unknown) {
    const input = UpdateMatchSetCommandV2Schema.parse(command);
    return this.command(session, 'update_match_set_v2', input, {
      p_capacity: input.capacity,
      p_expires_at: input.expiresAt,
      p_intent_kind: input.intentKind,
      p_set_id: input.setId,
      p_title: input.title,
    });
  }

  async closeSet(session: AuthSession, command: unknown) {
    const input = CloseMatchSetCommandV2Schema.parse(command);
    return this.command(session, 'close_match_set_v2', input, {
      p_reason: input.reason,
      p_set_id: input.setId,
    });
  }

  async reopenSet(session: AuthSession, command: unknown) {
    const input = ReopenMatchSetCommandV2Schema.parse(command);
    return this.command(session, 'reopen_match_set_v2', input, {
      p_set_id: input.setId,
    });
  }

  async inviteToSet(session: AuthSession, command: unknown) {
    const input = InviteToSetCommandV2Schema.parse(command);
    return this.command(session, 'invite_to_set_v2', input, {
      p_set_id: input.setId,
      p_target_player_id: input.targetPlayerId,
    });
  }

  async acceptInvite(session: AuthSession, command: unknown) {
    const input = AcceptSetInviteCommandV2Schema.parse(command);
    return this.command(session, 'accept_set_invite_v2', input, {
      p_invite_id: input.inviteId,
      p_set_id: input.setId,
    });
  }

  async declineInvite(session: AuthSession, command: unknown) {
    const input = DeclineSetInviteCommandV2Schema.parse(command);
    return this.command(session, 'decline_set_invite_v2', input, {
      p_invite_id: input.inviteId,
      p_set_id: input.setId,
    });
  }

  async cancelInvite(session: AuthSession, command: unknown) {
    const input = CancelSetInviteCommandV2Schema.parse(command);
    return this.command(session, 'cancel_set_invite_v2', input, {
      p_invite_id: input.inviteId,
      p_set_id: input.setId,
    });
  }

  async requestJoinV2(session: AuthSession, command: unknown) {
    const input = RequestSetJoinCommandV2Schema.parse(command);
    return this.command(session, 'request_set_join_v2', input, {
      p_set_id: input.setId,
    });
  }

  async acceptJoinRequest(session: AuthSession, command: unknown) {
    const input = AcceptSetJoinRequestCommandV2Schema.parse(command);
    return this.command(session, 'accept_set_join_request_v2', input, {
      p_join_request_id: input.joinRequestId,
      p_set_id: input.setId,
    });
  }

  async rejectJoinRequest(session: AuthSession, command: unknown) {
    const input = RejectSetJoinRequestCommandV2Schema.parse(command);
    return this.command(session, 'reject_set_join_request_v2', input, {
      p_join_request_id: input.joinRequestId,
      p_set_id: input.setId,
    });
  }

  async cancelJoinRequest(session: AuthSession, command: unknown) {
    const input = CancelSetJoinRequestCommandV2Schema.parse(command);
    return this.command(session, 'cancel_set_join_request_v2', input, {
      p_join_request_id: input.joinRequestId,
      p_set_id: input.setId,
    });
  }

  async leaveSet(session: AuthSession, command: unknown) {
    const input = LeaveSetCommandV2Schema.parse(command);
    return this.command(session, 'leave_set_v2', input, {
      p_reason_code: 'member_choice',
      p_set_id: input.setId,
    });
  }

  async removeMember(session: AuthSession, command: unknown) {
    const input = RemoveSetMemberCommandV2Schema.parse(command);
    return this.command(session, 'remove_set_member_v2', input, {
      p_member_player_id: input.memberPlayerId,
      p_reason_code: input.reasonCode,
      p_set_id: input.setId,
    });
  }

  async transferOwnership(session: AuthSession, command: unknown) {
    const input = TransferSetOwnershipCommandV2Schema.parse(command);
    return this.command(session, 'transfer_set_ownership_v2', input, {
      p_new_owner_player_id: input.targetPlayerId,
      p_set_id: input.setId,
    });
  }

  async invite(session: AuthSession, command: unknown) {
    const input = CreateSetInviteCommandV1Schema.parse(command);
    const metadata = this.metadataFactory(input.expectedSetVersion);
    return SetInviteReceiptV1Schema.parse(
      await this.rpc('create_set_invite_compat_v2', session, {
        p_audit: metadata.audit,
        p_correlation_id: input.correlationId,
        p_expected_version: input.expectedSetVersion,
        p_idempotency_key: input.idempotencyKey,
        p_set_id: input.setId,
        p_target_player_id: input.targetPlayerId,
      }),
    );
  }

  async requestJoin(session: AuthSession, command: unknown) {
    const input = RequestSetJoinCommandV1Schema.parse(command);
    const metadata = this.metadataFactory(input.expectedSetVersion);
    return SetJoinRequestReceiptV1Schema.parse(
      await this.rpc('request_set_join_compat_v2', session, {
        p_audit: metadata.audit,
        p_correlation_id: input.correlationId,
        p_expected_version: input.expectedSetVersion,
        p_idempotency_key: input.idempotencyKey,
        p_set_id: input.setId,
      }),
    );
  }

  private async command(
    session: AuthSession,
    functionName: string,
    metadata: Readonly<{
      audit: unknown;
      correlationId: string;
      expectedVersion: number;
      idempotencyKey: string;
    }>,
    body: Record<string, unknown>,
  ): Promise<MatchSetCommandReceiptV2> {
    return MatchSetCommandReceiptV2Schema.parse(
      await this.rpc(functionName, session, {
        ...body,
        p_audit: metadata.audit,
        p_correlation_id: metadata.correlationId,
        p_expected_version: metadata.expectedVersion,
        p_idempotency_key: metadata.idempotencyKey,
      }),
    );
  }
}

async function callRpc(
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) {
  return await supabaseRest<unknown>(`rpc/${functionName}`, {
    body,
    method: 'POST',
    session,
  });
}

function defaultMetadataFactory(expectedVersion: number) {
  return prepareCoreV2CommandMetadata(expectedVersion, {
    idempotencyScope: 'match-set',
  });
}
