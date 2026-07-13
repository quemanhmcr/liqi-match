import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import {
  SupabaseMatchIntentRepository,
  type MatchIntentRpcTransport,
} from '../supabase-match-intent-repository';

const session: AuthSession = {
  accessToken: 'access',
  expiresAt: 9_999_999_999,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: { id: '00000000-0000-4000-8000-000000000001' },
};

const snapshot = {
  activatedAt: '2026-07-14T08:00:00.000Z',
  expiresAt: '2026-07-14T10:00:00.000Z',
  filters: {
    intentKind: 'rank',
    mode: 'ranked',
    partyFormat: 'duo',
    roleSlugs: ['jungle'],
    sessionPlan: 'quick',
    timezone: 'Asia/Bangkok',
  },
  matchIntentId: '10000000-0000-4000-8000-000000000001',
  playerId: '20000000-0000-4000-8000-000000000001',
  state: 'active',
  version: 2,
} as const;

describe('SupabaseMatchIntentRepository', () => {
  it('maps activation to the authoritative RPC boundary', async () => {
    const rpc = jest.fn<MatchIntentRpcTransport>().mockResolvedValue({
      ...snapshot,
      repeated: false,
    });
    const repository = new SupabaseMatchIntentRepository(rpc);

    const receipt = await repository.activate(session, {
      filters: snapshot.filters,
      idempotencyKey: 'match-intent-activate:command-1',
    });

    expect(receipt.repeated).toBe(false);
    expect(rpc).toHaveBeenCalledWith('activate_match_intent_v1', session, {
      p_expected_version: null,
      p_filters: snapshot.filters,
      p_idempotency_key: 'match-intent-activate:command-1',
    });
  });

  it('rejects a response outside the executable contract', async () => {
    const rpc = jest
      .fn<MatchIntentRpcTransport>()
      .mockResolvedValue({ ...snapshot, version: 0 });
    const repository = new SupabaseMatchIntentRepository(rpc);

    await expect(repository.getCurrent(session)).rejects.toMatchObject({
      code: 'contract_violation',
      retryable: false,
    });
  });
});
