import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { discoverContractVersion } from '../contracts/discover-contracts';
import {
  ApiDiscoverRepository,
  discoverApiRoutes,
  type DiscoverApiTransport,
  type DiscoverRpcTransport,
} from '../services/discover-api-repository';
import type { DiscoverRequestContext } from '../services/discover-repository';

const request = jest.fn<DiscoverApiTransport['request']>();
const rpc = jest.fn<DiscoverRpcTransport>();
const repository = new ApiDiscoverRepository({ request }, rpc);
const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'viewer-1',
};

beforeEach(() => {
  request.mockReset();
  rpc.mockReset();
});

describe('ApiDiscoverRepository transport contract', () => {
  it('serializes overview criteria and viewer context without UI-only fields', async () => {
    request.mockResolvedValueOnce({
      contractVersion: discoverContractVersion,
      data: {
        filterOptions: [],
        metrics: [],
        sections: {
          players: { defaultSort: 'best_match', items: [], totalCount: 0 },
          sets: { defaultSort: 'best_match', items: [], totalCount: 0 },
          vibes: { defaultSort: 'popular', items: [], totalCount: 0 },
        },
      },
      meta: {
        generatedAt: '2026-07-11T08:00:00.000Z',
        requestId: 'overview-1',
      },
    });

    await repository.getOverview(context, {
      facetIds: ['mic', 'rank'],
      previewLimit: 3,
      query: 'duo',
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: discoverApiRoutes.overview,
      query: {
        facetId: ['mic', 'rank'],
        locale: 'vi',
        previewLimit: '3',
        query: 'duo',
        timezone: 'Asia/Bangkok',
      },
      session: null,
    });
  });

  it('reads production player recommendations from the authoritative Supabase snapshot RPC', async () => {
    const session = {
      accessToken: 'access',
      expiresAt: 9_999_999_999,
      refreshToken: 'refresh',
      tokenType: 'bearer',
      user: { id: '00000000-0000-4000-8000-000000000001' },
    } as const;
    rpc.mockResolvedValueOnce({
      items: [
        {
          capabilities: { canInvite: false, canLike: true, canPass: true },
          playerId: '20000000-0000-4000-8000-000000000002',
          profileSummary: {
            avatarAssetId: null,
            avatarUrl: null,
            displayName: 'Minh Anh',
            playerId: '20000000-0000-4000-8000-000000000002',
            primaryRole: null,
            profileId: '30000000-0000-4000-8000-000000000002',
            profileVersion: 4,
            rank: null,
          },
          recommendationContext: {
            reasonCodes: ['active_now', 'mode_overlap'],
            score: 70,
          },
          relationshipState: 'none',
        },
      ],
      nextCursor: 'a0000000-0000-4000-8000-000000000001',
      snapshot: {
        createdAt: '2026-07-14T08:00:00.000Z',
        expiresAt: '2026-07-14T08:10:00.000Z',
        intentVersion: 3,
        snapshotId: 'b0000000-0000-4000-8000-000000000001',
      },
    });

    const response = await repository.listPlayers(
      { ...context, session, viewerId: session.user.id },
      {
        facetIds: [],
        limit: 20,
        query: '',
        sort: 'best_match',
      },
    );

    expect(rpc).toHaveBeenCalledWith('list_discovery_candidates_v1', session, {
      p_cursor: null,
      p_limit: 20,
    });
    expect(request).not.toHaveBeenCalled();
    expect(response.data.items[0]).toMatchObject({
      intentVersion: 3,
      matchScore: 70,
      playerId: '20000000-0000-4000-8000-000000000002',
      profileId: '30000000-0000-4000-8000-000000000002',
      profileVersion: 4,
      relationshipState: 'none',
    });
    expect(response.data.pageInfo).toEqual({
      hasNextPage: true,
      nextCursor: 'a0000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects unsupported client-side player filtering before snapshot pagination', async () => {
    const session = {
      accessToken: 'access',
      expiresAt: 9_999_999_999,
      refreshToken: 'refresh',
      tokenType: 'bearer',
      user: { id: '00000000-0000-4000-8000-000000000001' },
    } as const;

    await expect(
      repository.listPlayers(
        { ...context, session, viewerId: session.user.id },
        { facetIds: ['mic'], limit: 20, query: '', sort: 'best_match' },
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends join commands to the Set-scoped route with an idempotency header', async () => {
    request.mockResolvedValueOnce({
      createdAt: '2026-07-11T08:00:00.000Z',
      repeated: false,
      requestId: 'join-1',
      setId: 'set/encoded',
      setVersion: 4,
      status: 'pending',
    });

    await repository.requestSetJoin(context, {
      clientMutationId: 'client-1',
      expectedSetVersion: 4,
      idempotencyKey: 'idem-1',
      setId: 'set/encoded',
      source: 'discover',
    });

    expect(request).toHaveBeenCalledWith({
      body: {
        clientMutationId: 'client-1',
        expectedSetVersion: 4,
        idempotencyKey: 'idem-1',
        setId: 'set/encoded',
        source: 'discover',
      },
      headers: { 'idempotency-key': 'idem-1' },
      method: 'POST',
      path: '/v1/discover/sets/set%2Fencoded/join-requests',
      session: null,
    });
  });

  it('rejects transport payloads that violate the runtime contract', async () => {
    request.mockResolvedValueOnce({ data: { items: 'not-an-array' } });

    await expect(
      repository.listSets(context, {
        facetIds: [],
        limit: 20,
        query: '',
        sort: 'best_match',
      }),
    ).rejects.toMatchObject({ code: 'contract_violation' });
  });
});
