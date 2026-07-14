import {
  PlayerDecisionCommandV1Schema,
  PlayerDecisionReceiptV1Schema,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { MatchDecisionRepository } from './match-decision-repository';

export type MatchDecisionRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) => Promise<unknown>;

export class SupabaseMatchDecisionRepository implements MatchDecisionRepository {
  constructor(private readonly rpc: MatchDecisionRpcTransport = callRpc) {}

  async decide(session: AuthSession, command: unknown) {
    const input = PlayerDecisionCommandV1Schema.parse(command);
    const response = await this.rpc('record_player_decision_v1', session, {
      p_correlation_id: input.correlationId,
      p_decision: input.decision,
      p_expected_intent_version: input.expectedIntentVersion,
      p_expected_target_profile_version: input.expectedTargetProfileVersion,
      p_idempotency_key: input.idempotencyKey,
      p_target_player_id: input.targetPlayerId,
    });
    return PlayerDecisionReceiptV1Schema.parse(response);
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
