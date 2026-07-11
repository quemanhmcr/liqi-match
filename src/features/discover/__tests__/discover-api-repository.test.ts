import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { discoverContractVersion } from '../contracts/discover-contracts';
import {
  ApiDiscoverRepository,
  discoverApiRoutes,
  type DiscoverApiTransport,
} from '../services/discover-api-repository';
import type { DiscoverRequestContext } from '../services/discover-repository';

const request = jest.fn<DiscoverApiTransport['request']>();
const repository = new ApiDiscoverRepository({ request });
const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'viewer-1',
};

beforeEach(() => {
  request.mockReset();
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
