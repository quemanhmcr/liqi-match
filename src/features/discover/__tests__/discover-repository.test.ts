import { beforeEach, describe, expect, it } from '@jest/globals';

import { MockDiscoverRepository } from '../services/discover-mock-repository';
import type { DiscoverRequestContext } from '../services/discover-repository';

const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'test-viewer',
};

let repository: MockDiscoverRepository;

beforeEach(() => {
  repository = new MockDiscoverRepository({
    now: () => '2026-07-11T08:00:00.000Z',
  });
});

describe('MockDiscoverRepository', () => {
  it('searches without accents and combines facets with AND semantics', async () => {
    const searched = await repository.listSets(context, {
      facetIds: [],
      limit: 50,
      query: 'tro thu',
      sort: 'best_match',
    });
    expect(searched.data.items.map((item) => item.id)).toEqual([
      'duo-jungle-support',
      'leo-rank-5v5',
    ]);

    const filtered = await repository.listSets(context, {
      facetIds: ['rank', 'non-toxic'],
      limit: 50,
      query: '',
      sort: 'best_match',
    });
    expect(filtered.data.items.map((item) => item.id)).toEqual([
      'leo-rank-5v5',
      'team-late-night',
    ]);
  });

  it('sorts Sets by match, recency and remaining capacity', async () => {
    const best = await repository.listSets(context, {
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'best_match',
    });
    expect(best.data.items.map((item) => item.id)).toEqual([
      'team-sao-bang',
      'duo-jungle-support',
      'leo-rank-5v5',
      'team-late-night',
    ]);

    const newest = await repository.listSets(context, {
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'newest',
    });
    expect(newest.data.items.map((item) => item.id)).toEqual([
      'leo-rank-5v5',
      'team-sao-bang',
      'duo-jungle-support',
      'team-late-night',
    ]);

    const almostFull = await repository.listSets(context, {
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'almost_full',
    });
    expect(almostFull.data.items.map((item) => item.id)).toEqual([
      'team-sao-bang',
      'duo-jungle-support',
      'team-late-night',
      'leo-rank-5v5',
    ]);
  });

  it('uses opaque cursor pages without duplicate items', async () => {
    const first = await repository.listPlayers(context, {
      facetIds: [],
      limit: 2,
      query: '',
      sort: 'best_match',
    });
    expect(first.data.pageInfo).toEqual({
      hasNextPage: true,
      nextCursor: 'discover:2',
    });
    const second = await repository.listPlayers(context, {
      cursor: first.data.pageInfo.nextCursor ?? undefined,
      facetIds: [],
      limit: 2,
      query: '',
      sort: 'best_match',
    });
    expect(second.data.items.map((item) => item.profileId)).toEqual([
      'an-nhi-adc',
      'khoa-jungle',
    ]);
    expect(
      second.data.items.some((item) =>
        first.data.items.some(
          (firstItem) => firstItem.profileId === item.profileId,
        ),
      ),
    ).toBe(false);
  });

  it('rejects stale cursors with a typed error', async () => {
    await expect(
      repository.listVibes(context, {
        cursor: 'page=2',
        facetIds: [],
        limit: 2,
        query: '',
        sort: 'popular',
      }),
    ).rejects.toMatchObject({ code: 'stale_cursor' });
  });

  it('makes Set join requests idempotent and exposes pending viewer state', async () => {
    const command = {
      clientMutationId: 'client-join-1',
      idempotencyKey: 'join-key-1',
      setId: 'leo-rank-5v5',
      source: 'discover' as const,
    };
    const first = await repository.requestSetJoin(context, command);
    const repeated = await repository.requestSetJoin(context, command);
    expect(first).toMatchObject({ repeated: false, status: 'pending' });
    expect(repeated).toMatchObject({
      repeated: true,
      requestId: first.requestId,
    });

    const list = await repository.listSets(context, {
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'best_match',
    });
    expect(
      list.data.items.find((item) => item.id === 'leo-rank-5v5')?.viewerState
        .joinRequestStatus,
    ).toBe('pending');
  });

  it('makes player invites idempotent and requires the capability target Set', async () => {
    const command = {
      clientMutationId: 'client-invite-1',
      idempotencyKey: 'invite-key-1',
      profileId: 'an-nhi-adc',
      setId: 'leo-rank-5v5',
      source: 'discover' as const,
    };
    const first = await repository.invitePlayerToSet(context, command);
    const repeated = await repository.invitePlayerToSet(context, command);
    expect(first).toMatchObject({ repeated: false, status: 'pending' });
    expect(repeated).toMatchObject({
      repeated: true,
      inviteId: first.inviteId,
    });

    const players = await repository.listPlayers(context, {
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'best_match',
    });
    expect(
      players.data.items.find((item) => item.profileId === 'an-nhi-adc')
        ?.capabilities.invite.state,
    ).toBe('pending');

    await expect(
      repository.invitePlayerToSet(context, {
        ...command,
        idempotencyKey: 'wrong-target-key',
        setId: 'team-sao-bang',
      }),
    ).rejects.toMatchObject({ code: 'invite_target_required' });
  });
});
