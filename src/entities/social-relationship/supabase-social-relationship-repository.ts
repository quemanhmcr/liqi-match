import {
  FriendshipListPageV2Schema,
  SocialRelationshipSnapshotV2Schema,
  TrustVisibilityDecisionV2Schema,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { SocialRelationshipRepository } from './social-relationship-repository';

export type SocialRelationshipRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export class SupabaseSocialRelationshipRepository implements SocialRelationshipRepository {
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
