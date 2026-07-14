import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  ApiDiscoverRepository,
  type DiscoverRpcTransport,
} from '../services/discover-api-repository';
import type { DiscoverRequestContext } from '../services/discover-repository';

const rpc = jest.fn<DiscoverRpcTransport>();
const repository = new ApiDiscoverRepository(rpc);
const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'viewer-1',
};

beforeEach(() => {
  rpc.mockReset();
});

describe('ApiDiscoverRepository transport contract', () => {
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

  it('rejects the legacy Set join boundary before any transport call', async () => {
    await expect(
      repository.requestSetJoin(context, {
        clientMutationId: 'client-1',
        expectedSetVersion: 4,
        idempotencyKey: 'idem-1',
        setId: 'set/encoded',
        source: 'discover',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects legacy Set and Vibe reads before network access', async () => {
    await expect(
      repository.listSets(context, {
        facetIds: [],
        limit: 20,
        query: '',
        sort: 'best_match',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      repository.listVibes(context, {
        facetIds: [],
        limit: 20,
        query: '',
        sort: 'popular',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects the legacy profile-based Set invite boundary', async () => {
    await expect(
      repository.invitePlayerToSet(context, {
        clientMutationId: 'client-1',
        idempotencyKey: 'idem-1',
        profileId: 'legacy-profile-id',
        setId: 'legacy-set-id',
        source: 'discover',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('builds the production overview from authoritative candidate snapshots only', async () => {
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
            reasonCodes: ['active_now'],
            score: 70,
          },
          relationshipState: 'none',
        },
      ],
      nextCursor: null,
      snapshot: {
        createdAt: '2026-07-14T08:00:00.000Z',
        expiresAt: '2026-07-14T08:10:00.000Z',
        intentVersion: 3,
        snapshotId: 'b0000000-0000-4000-8000-000000000001',
      },
    });

    const response = await repository.getOverview(
      { ...context, session, viewerId: session.user.id },
      { facetIds: [], previewLimit: 6, query: '' },
    );

    expect(rpc).toHaveBeenCalledWith('list_discovery_candidates_v1', session, {
      p_cursor: null,
      p_limit: 6,
    });
    expect(JSON.stringify(response)).toContain(
      '20000000-0000-4000-8000-000000000002',
    );
  });
});
