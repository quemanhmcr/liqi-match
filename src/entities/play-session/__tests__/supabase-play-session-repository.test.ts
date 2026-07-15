import { describe, expect, it, jest } from '@jest/globals';

import {
  createSupabasePlaySessionRepository,
  type CoreV2RpcTransport,
} from '../index';

const PLAYER_A = '20000000-0000-4000-8000-000000000001';
const PLAYER_B = '20000000-0000-4000-8000-000000000002';
const SESSION_ID = '90000000-0000-4000-8000-000000000001';
const INVITE_ID = '91000000-0000-4000-8000-000000000001';

function snapshot() {
  return {
    cancellationReason: null,
    cancelledAt: null,
    capacity: 2,
    communication: {
      conversationId: null,
      membershipVersion: 0,
      status: 'pending',
    },
    completedAt: null,
    completionClaims: [],
    createdAt: '2026-07-14T12:00:00.000Z',
    members: [
      {
        joinedAt: '2026-07-14T12:00:00.000Z',
        leftAt: null,
        playerId: PLAYER_A,
        role: 'owner',
        state: 'active',
      },
    ],
    membershipVersion: 1,
    ownerPlayerId: PLAYER_A,
    readyCheck: null,
    roleAssignments: [],
    scheduledFor: null,
    sessionId: SESSION_ID,
    source: { kind: 'manual' },
    startedAt: null,
    state: 'recruiting',
    timezone: 'Asia/Bangkok',
    title: 'Duo tối nay',
    updatedAt: '2026-07-14T12:00:00.000Z',
    version: 1,
  } as const;
}

const actor = {
  lifecycle: {
    discoverable: true,
    messagingAllowed: true,
    playerId: PLAYER_A,
    profileId: '30000000-0000-4000-8000-000000000001',
    profileVersion: 1,
    state: 'active',
    updatedAt: '2026-07-14T12:00:00.000Z',
    version: 1,
  },
  principal: {
    accountId: '10000000-0000-4000-8000-000000000001',
    expiresAt: '2026-07-14T13:00:00.000Z',
    issuedAt: '2026-07-14T12:00:00.000Z',
    playerId: PLAYER_A,
    sessionId: '11000000-0000-4000-8000-000000000001',
  },
} as never;

describe('Supabase Play Session repository', () => {
  it('reads one authoritative Session through the RPC surface', async () => {
    const invoke = jest.fn<CoreV2RpcTransport['invoke']>(async () =>
      snapshot(),
    );
    const repository = createSupabasePlaySessionRepository({
      accessTokenProvider: { getAccessToken: async () => 'access-token' },
      transport: { invoke },
    });

    await expect(repository.get(actor, SESSION_ID as never)).resolves.toEqual(
      snapshot(),
    );
    expect(invoke).toHaveBeenCalledWith({
      accessToken: 'access-token',
      args: { p_session_id: SESSION_ID },
      rpcName: 'get_play_session_v2',
    });
  });

  it('parses current sessions and pending invite projections', async () => {
    const invoke = jest.fn<CoreV2RpcTransport['invoke']>(async ({ rpcName }) =>
      rpcName === 'list_current_play_sessions_v2'
        ? [snapshot()]
        : [
            {
              createdAt: '2026-07-14T12:00:00.000Z',
              expiresAt: null,
              inviteId: INVITE_ID,
              inviterPlayerId: PLAYER_A,
              session: snapshot(),
              sessionId: SESSION_ID,
              state: 'pending',
              targetPlayerId: PLAYER_B,
              version: 1,
            },
          ],
    );
    const repository = createSupabasePlaySessionRepository({
      accessTokenProvider: { getAccessToken: async () => 'access-token' },
      transport: { invoke },
    });

    await expect(repository.listCurrent(actor)).resolves.toHaveLength(1);
    await expect(repository.listInvites(actor, 7)).resolves.toHaveLength(1);
    expect(invoke).toHaveBeenNthCalledWith(1, {
      accessToken: 'access-token',
      args: { p_limit: 20 },
      rpcName: 'list_current_play_sessions_v2',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      accessToken: 'access-token',
      args: { p_limit: 7 },
      rpcName: 'list_my_session_invites_v2',
    });
  });

  it('fails closed without auth and validates list limits locally', async () => {
    const invoke = jest.fn<CoreV2RpcTransport['invoke']>();
    const repository = createSupabasePlaySessionRepository({
      accessTokenProvider: { getAccessToken: async () => null },
      transport: { invoke },
    });

    await expect(repository.listCurrent(actor)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(repository.listInvites(actor, 0)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
