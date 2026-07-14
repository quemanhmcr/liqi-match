import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import {
  SupabaseHomeMatchFactsRepository,
  type HomeMatchFactsRpcTransport,
} from '../supabase-home-match-facts-repository';

const session = {
  accessToken: 'token',
  expiresAt: 4102444800,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: {
    email: 'home@example.test',
    id: '00000000-0000-0000-0000-000000000401',
    user_metadata: {},
  },
} satisfies AuthSession;

const fixture = {
  generatedAt: '2026-07-14T08:06:00.000Z',
  items: [
    {
      canMessage: true,
      conversationId: '90000000-0000-4000-8000-000000000001',
      correlationId: '70000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-14T08:05:00.000Z',
      kind: 'rank',
      matchId: '60000000-0000-4000-8000-000000000001',
      opponent: {
        avatarAssetId: null,
        avatarUrl: null,
        displayName: 'Minh Anh',
        playerId: '20000000-0000-4000-8000-000000000002',
        primaryRole: null,
        profileId: '30000000-0000-4000-8000-000000000002',
        profileVersion: 4,
        rank: null,
      },
      participantIds: [
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
      ],
      source: 'mutual_like',
      status: 'conversation_ready',
    },
  ],
};

describe('SupabaseHomeMatchFactsRepository', () => {
  it('calls the authenticated RPC and validates the executable contract', async () => {
    const rpc = jest
      .fn<HomeMatchFactsRpcTransport>()
      .mockResolvedValue(fixture);
    const repository = new SupabaseHomeMatchFactsRepository(rpc);

    await expect(repository.list(session)).resolves.toMatchObject(fixture);
    expect(rpc).toHaveBeenCalledWith('list_home_match_facts_v1', session, {});
  });

  it('rejects synthetic unread or invalid readiness payloads', async () => {
    const rpc = jest.fn<HomeMatchFactsRpcTransport>().mockResolvedValue({
      ...fixture,
      items: [
        {
          ...fixture.items[0],
          canMessage: true,
          conversationId: null,
          unreadCount: 3,
        },
      ],
    });
    const repository = new SupabaseHomeMatchFactsRepository(rpc);

    await expect(repository.list(session)).rejects.toThrow();
  });
});
