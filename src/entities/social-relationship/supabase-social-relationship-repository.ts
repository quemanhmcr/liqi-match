import {
  FriendshipListPageV2Schema,
  PlayerPrivacyCommandReceiptV2Schema,
  PlayerPrivacySettingsV2Schema,
  ReportReceiptV2Schema,
  SocialRelationshipCommandReceiptV2Schema,
  SocialRelationshipSnapshotV2Schema,
  TrustVisibilityDecisionV2Schema,
  type AcceptFriendshipCommandV2,
  type BlockPlayerCommandV2,
  type CancelFriendshipCommandV2,
  type DeclineFriendshipCommandV2,
  type MutePlayerCommandV2,
  type RemoveFriendshipCommandV2,
  type ReportMessageCommandV2,
  type ReportPlayerCommandV2,
  type RequestFriendshipCommandV2,
  type UnblockPlayerCommandV2,
  type UnmutePlayerCommandV2,
  type UpdatePlayerPrivacyCommandV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type {
  PlayerPrivacyProvider,
  PlayerSafetyCommandService,
  SocialRelationshipCommandService,
  SocialRelationshipRepository,
} from './social-relationship-repository';

export type SocialRelationshipRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export class SupabaseSocialRelationshipRepository
  implements
    SocialRelationshipRepository,
    SocialRelationshipCommandService,
    PlayerSafetyCommandService,
    PlayerPrivacyProvider
{
  constructor(private readonly rpc: SocialRelationshipRpcTransport = callRpc) {}

  async getRelationship(session: AuthSession, targetPlayerId: string) {
    return SocialRelationshipSnapshotV2Schema.parse(
      await this.rpc('get_relationship_v2', session, {
        p_target_player_id: targetPlayerId,
      }),
    );
  }

  async getTrustVisibility(session: AuthSession, targetPlayerId: string) {
    return TrustVisibilityDecisionV2Schema.parse(
      await this.rpc('get_trust_visibility_v2', session, {
        p_target_player_id: targetPlayerId,
      }),
    );
  }

  async getPrivacy(session: AuthSession) {
    return PlayerPrivacySettingsV2Schema.parse(
      await this.rpc('get_player_privacy_v2', session, {}),
    );
  }

  async requestFriendship(
    session: AuthSession,
    command: RequestFriendshipCommandV2,
  ) {
    return await this.relationshipCommand(
      'request_friendship_v2',
      session,
      command,
    );
  }

  async acceptFriendship(
    session: AuthSession,
    command: AcceptFriendshipCommandV2,
  ) {
    return await this.relationshipCommand(
      'accept_friendship_v2',
      session,
      command,
    );
  }

  async declineFriendship(
    session: AuthSession,
    command: DeclineFriendshipCommandV2,
  ) {
    return await this.relationshipCommand(
      'decline_friendship_v2',
      session,
      command,
    );
  }

  async cancelFriendship(
    session: AuthSession,
    command: CancelFriendshipCommandV2,
  ) {
    return await this.relationshipCommand(
      'cancel_friendship_request_v2',
      session,
      command,
    );
  }

  async removeFriendship(
    session: AuthSession,
    command: RemoveFriendshipCommandV2,
  ) {
    return await this.relationshipCommand(
      'remove_friendship_v2',
      session,
      command,
    );
  }

  async blockPlayer(session: AuthSession, command: BlockPlayerCommandV2) {
    return await this.relationshipCommand('block_player_v2', session, command);
  }

  async unblockPlayer(session: AuthSession, command: UnblockPlayerCommandV2) {
    return await this.relationshipCommand(
      'unblock_player_v2',
      session,
      command,
    );
  }

  async mutePlayer(session: AuthSession, command: MutePlayerCommandV2) {
    return await this.relationshipCommand('mute_player_v2', session, command);
  }

  async unmutePlayer(session: AuthSession, command: UnmutePlayerCommandV2) {
    return await this.relationshipCommand('unmute_player_v2', session, command);
  }

  async updatePrivacy(
    session: AuthSession,
    command: UpdatePlayerPrivacyCommandV2,
  ) {
    return PlayerPrivacyCommandReceiptV2Schema.parse(
      await this.rpc('update_player_privacy_v2', session, { command }),
    );
  }

  async reportPlayer(session: AuthSession, command: ReportPlayerCommandV2) {
    return ReportReceiptV2Schema.parse(
      await this.rpc('report_player_v2', session, { command }),
    );
  }

  async reportMessage(session: AuthSession, command: ReportMessageCommandV2) {
    return ReportReceiptV2Schema.parse(
      await this.rpc('report_message_v2', session, { command }),
    );
  }

  async listFriendships(
    session: AuthSession,
    input: Readonly<{ afterPlayerId?: string | null; limit?: number }> = {},
  ) {
    return FriendshipListPageV2Schema.parse(
      await this.rpc('list_friendships_v2', session, {
        p_after_player_id: input.afterPlayerId ?? null,
        p_limit: normalizeLimit(input.limit),
      }),
    );
  }

  private async relationshipCommand(
    functionName: string,
    session: AuthSession,
    command: unknown,
  ) {
    return SocialRelationshipCommandReceiptV2Schema.parse(
      await this.rpc(functionName, session, { command }),
    );
  }
}

async function callRpc(
  functionName: string,
  session: AuthSession,
  body: Readonly<Record<string, unknown>>,
) {
  return await supabaseRest<unknown>(`rpc/${functionName}`, {
    body,
    method: 'POST',
    session,
  });
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined) return 50;
  if (!Number.isInteger(value)) return 50;
  return Math.min(Math.max(value, 1), 100);
}
