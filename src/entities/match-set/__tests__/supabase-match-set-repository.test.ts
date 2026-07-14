import { expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import {
  SupabaseMatchSetRepository,
  type MatchSetRpcTransport,
} from '../supabase-match-set-repository';

const session: AuthSession = {
  accessToken: 'access',
  expiresAt: 9_999_999_999,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: { id: '00000000-0000-4000-8000-000000000001' },
};

it('maps Set reads and commands to authoritative RPCs', async () => {
  const rpc = jest.fn<MatchSetRpcTransport>();
  rpc
    .mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      snapshot: {
        createdAt: '2026-07-14T08:00:00.000Z',
        expiresAt: '2026-07-14T08:10:00.000Z',
        intentVersion: 2,
        snapshotId: 'a2000000-0000-4000-8000-000000000001',
      },
    })
    .mockResolvedValueOnce({
      createdAt: '2026-07-14T08:00:00.000Z',
      joinRequestId: 'a4000000-0000-4000-8000-000000000001',
      repeated: false,
      setId: 'a1000000-0000-4000-8000-000000000001',
      state: 'pending',
    })
    .mockResolvedValueOnce({
      createdAt: '2026-07-14T08:00:00.000Z',
      inviteId: 'a3000000-0000-4000-8000-000000000001',
      repeated: false,
      setId: 'a1000000-0000-4000-8000-000000000001',
      state: 'pending',
      targetPlayerId: '20000000-0000-4000-8000-000000000002',
    });
  const repository = new SupabaseMatchSetRepository(rpc);

  await repository.list(session, { limit: 10 });
  await repository.requestJoin(session, {
    correlationId: '70000000-0000-4000-8000-000000000001',
    expectedSetVersion: 3,
    idempotencyKey: 'set-join:70000000-0000-4000-8000-000000000001',
    setId: 'a1000000-0000-4000-8000-000000000001',
  });
  await repository.invite(session, {
    correlationId: '70000000-0000-4000-8000-000000000002',
    expectedSetVersion: 3,
    idempotencyKey: 'set-invite:70000000-0000-4000-8000-000000000002',
    setId: 'a1000000-0000-4000-8000-000000000001',
    targetPlayerId: '20000000-0000-4000-8000-000000000002',
  });

  expect(rpc.mock.calls).toEqual([
    ['list_discovery_sets_v1', session, { p_cursor: null, p_limit: 10 }],
    [
      'request_set_join_v1',
      session,
      {
        p_correlation_id: '70000000-0000-4000-8000-000000000001',
        p_expected_set_version: 3,
        p_idempotency_key: 'set-join:70000000-0000-4000-8000-000000000001',
        p_set_id: 'a1000000-0000-4000-8000-000000000001',
      },
    ],
    [
      'create_set_invite_v1',
      session,
      {
        p_correlation_id: '70000000-0000-4000-8000-000000000002',
        p_expected_set_version: 3,
        p_idempotency_key: 'set-invite:70000000-0000-4000-8000-000000000002',
        p_set_id: 'a1000000-0000-4000-8000-000000000001',
        p_target_player_id: '20000000-0000-4000-8000-000000000002',
      },
    ],
  ]);
});
