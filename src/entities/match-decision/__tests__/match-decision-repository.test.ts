import { expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import {
  SupabaseMatchDecisionRepository,
  type MatchDecisionRpcTransport,
} from '../supabase-match-decision-repository';

const session: AuthSession = {
  accessToken: 'access',
  expiresAt: 9_999_999_999,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: { id: '00000000-0000-4000-8000-000000000001' },
};

it('maps the executable command to the authoritative decision RPC', async () => {
  const rpc = jest.fn<MatchDecisionRpcTransport>().mockResolvedValue({
    match: null,
    relationshipState: 'liked',
    repeated: false,
  });
  const repository = new SupabaseMatchDecisionRepository(rpc);
  const command = {
    correlationId: '70000000-0000-4000-8000-000000000001',
    decision: 'like' as const,
    expectedIntentVersion: 2,
    expectedTargetProfileVersion: 4,
    idempotencyKey: 'player-decision:70000000-0000-4000-8000-000000000001',
    targetPlayerId: '20000000-0000-4000-8000-000000000002',
  };

  await expect(repository.decide(session, command)).resolves.toMatchObject({
    relationshipState: 'liked',
  });
  expect(rpc).toHaveBeenCalledWith('record_player_decision_v1', session, {
    p_correlation_id: command.correlationId,
    p_decision: 'like',
    p_expected_intent_version: 2,
    p_expected_target_profile_version: 4,
    p_idempotency_key: command.idempotencyKey,
    p_target_player_id: command.targetPlayerId,
  });
});
