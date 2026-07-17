import {
  DiscoverOverviewResponseSchema,
  DiscoverPlayerListParamsSchema,
  DiscoverPlayersResponseSchema,
  DiscoverServiceError,
  DiscoverSetListParamsSchema,
  DiscoverSetsResponseSchema,
  DiscoverVibeListParamsSchema,
  DiscoverVibesResponseSchema,
  InvitePlayerToSetCommandSchema,
  PlayerInviteReceiptSchema,
  RequestSetJoinCommandSchema,
  SetJoinRequestReceiptSchema,
  discoverContractVersion,
  type CanonicalDiscoverOverviewParams,
  type CanonicalDiscoverPlayerListParams,
  type CanonicalDiscoverSetListParams,
  type CanonicalDiscoverVibeListParams,
  type DiscoverOverviewData,
  type DiscoverPage,
  type DiscoverPlayerRecommendation,
  type DiscoverResponse,
  type DiscoverSet,
  type DiscoverVibe,
  type InvitePlayerToSetCommand,
  type PlayerInviteReceipt,
  type RequestSetJoinCommand,
  type SetJoinRequestReceipt,
} from '../contracts/discover-contracts';
import {
  discoverFilterOptionsFixture,
  discoverFixtureGeneratedAt,
  discoverMetricsFixture,
  discoverOverviewFixtureIds,
  discoverPlayersFixture,
  discoverSetsFixture,
  discoverVibesFixture,
} from '../data/discover.fixture';
import {
  filterPlayers,
  filterSets,
  filterVibes,
} from '../model/discover-search';
import {
  fullDiscoverCapabilities,
  type DiscoverRepository,
  type DiscoverRequestContext,
} from './discover-repository';

type Clock = { now: () => string };

export class MockDiscoverRepository implements DiscoverRepository {
  readonly capabilities = fullDiscoverCapabilities;
  private requestCounter = 0;
  private readonly joinBySet = new Map<string, SetJoinRequestReceipt>();
  private readonly inviteByProfile = new Map<string, PlayerInviteReceipt>();
  private readonly idempotency = new Map<
    string,
    SetJoinRequestReceipt | PlayerInviteReceipt
  >();

  constructor(
    private readonly clock: Clock = { now: () => discoverFixtureGeneratedAt },
  ) {}

  reset() {
    this.requestCounter = 0;
    this.joinBySet.clear();
    this.inviteByProfile.clear();
    this.idempotency.clear();
  }

  async getOverview(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ) {
    return this.peekOverview(context, params);
  }

  peekOverview(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ): DiscoverResponse<DiscoverOverviewData> {
    const canonical = canonicalOverviewParams(params);
    const overviewVibes = byIds(
      discoverVibesFixture,
      discoverOverviewFixtureIds.vibes,
      (item) => item.id,
    );
    const overviewSets = byIds(
      discoverSetsFixture,
      discoverOverviewFixtureIds.sets,
      (item) => item.id,
    );
    const overviewPlayers = byIds(
      discoverPlayersFixture,
      discoverOverviewFixtureIds.players,
      (item) => item.profileId,
    );
    const filteredPlayers = filterPlayers(
      this.withPlayerViewerState(overviewPlayers),
      canonical.query,
      canonical.facetIds,
    );
    const filteredSets = filterSets(
      this.withSetViewerState(overviewSets),
      canonical.query,
      canonical.facetIds,
    );
    const filteredVibes = filterVibes(
      overviewVibes,
      canonical.query,
      canonical.facetIds,
    );
    const data: DiscoverOverviewData = {
      filterOptions: [...discoverFilterOptionsFixture],
      metrics: [...discoverMetricsFixture],
      sections: {
        players: {
          defaultSort: 'best_match',
          items: filteredPlayers.slice(0, canonical.previewLimit),
          totalCount: filteredPlayers.length,
        },
        sets: {
          defaultSort: 'best_match',
          items: filteredSets.slice(0, canonical.previewLimit),
          totalCount: filteredSets.length,
        },
        vibes: {
          defaultSort: 'popular',
          items: filteredVibes.slice(0, canonical.previewLimit),
          totalCount: filteredVibes.length,
        },
      },
    };
    return parseContract(
      DiscoverOverviewResponseSchema,
      this.response(data, 'overview'),
    );
  }

  async listVibes(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverVibeListParams,
  ) {
    return this.peekVibes(context, params);
  }

  peekVibes(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverVibeListParams,
  ): DiscoverResponse<DiscoverPage<DiscoverVibe>> {
    const canonical = DiscoverVibeListParamsSchema.parse(params);
    let items = filterVibes(
      discoverVibesFixture,
      canonical.query,
      canonical.facetIds,
    );
    if (canonical.sort === 'popular') {
      items = [...items].sort(
        (left, right) => right.engagement.count - left.engagement.count,
      );
    } else if (canonical.sort === 'newest') {
      items = [...items].reverse();
    }
    return parseContract(
      DiscoverVibesResponseSchema,
      this.response(page(items, canonical.cursor, canonical.limit), 'vibes'),
    );
  }

  async listSets(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverSetListParams,
  ) {
    return this.peekSets(context, params);
  }

  peekSets(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverSetListParams,
  ): DiscoverResponse<DiscoverPage<DiscoverSet>> {
    const canonical = DiscoverSetListParamsSchema.parse(params);
    let items = filterSets(
      this.withSetViewerState(discoverSetsFixture),
      canonical.query,
      canonical.facetIds,
    );
    items = sortSets(items, canonical.sort, canonical.query);
    return parseContract(
      DiscoverSetsResponseSchema,
      this.response(page(items, canonical.cursor, canonical.limit), 'sets'),
    );
  }

  async listPlayers(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ) {
    return this.peekPlayers(context, params);
  }

  peekPlayers(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ): DiscoverResponse<DiscoverPage<DiscoverPlayerRecommendation>> {
    const canonical = DiscoverPlayerListParamsSchema.parse(params);
    let items = filterPlayers(
      this.withPlayerViewerState(discoverPlayersFixture),
      canonical.query,
      canonical.facetIds,
    );
    if (canonical.sort === 'best_match') {
      items = [...items].sort(
        (left, right) => right.matchScore - left.matchScore,
      );
    } else if (canonical.sort === 'online') {
      items = [...items].sort(
        (left, right) =>
          Number(right.onlineStatus === 'online') -
            Number(left.onlineStatus === 'online') ||
          right.matchScore - left.matchScore,
      );
    } else {
      items = [...items].reverse();
    }
    return parseContract(
      DiscoverPlayersResponseSchema,
      this.response(page(items, canonical.cursor, canonical.limit), 'players'),
    );
  }

  async requestSetJoin(
    _context: DiscoverRequestContext,
    command: RequestSetJoinCommand,
  ) {
    const canonical = RequestSetJoinCommandSchema.parse(command);
    const repeatedByKey = this.idempotency.get(canonical.idempotencyKey);
    if (repeatedByKey && 'requestId' in repeatedByKey) {
      return SetJoinRequestReceiptSchema.parse({
        ...repeatedByKey,
        repeated: true,
      });
    }
    const set = discoverSetsFixture.find((item) => item.id === canonical.setId);
    if (!set) throw new DiscoverServiceError('not_found', 'Set not found');
    if (set.recruitment.status === 'full') {
      throw new DiscoverServiceError('set_full', 'Set is full');
    }
    if (set.recruitment.status === 'closed') {
      throw new DiscoverServiceError('set_closed', 'Set is closed');
    }
    if (!set.viewerState.canRequestJoin) {
      throw new DiscoverServiceError(
        'forbidden',
        'Join request is unavailable',
      );
    }
    const existing = this.joinBySet.get(set.id);
    if (existing) {
      const repeated = SetJoinRequestReceiptSchema.parse({
        ...existing,
        repeated: true,
      });
      this.idempotency.set(canonical.idempotencyKey, repeated);
      return repeated;
    }
    const receipt = SetJoinRequestReceiptSchema.parse({
      createdAt: this.clock.now(),
      repeated: false,
      requestId: `join-${set.id}`,
      setId: set.id,
      setVersion: set.version,
      status: 'pending',
    });
    this.joinBySet.set(set.id, receipt);
    this.idempotency.set(canonical.idempotencyKey, receipt);
    return receipt;
  }

  async invitePlayerToSet(
    _context: DiscoverRequestContext,
    command: InvitePlayerToSetCommand,
  ) {
    const canonical = InvitePlayerToSetCommandSchema.parse(command);
    const repeatedByKey = this.idempotency.get(canonical.idempotencyKey);
    if (repeatedByKey && 'inviteId' in repeatedByKey) {
      return PlayerInviteReceiptSchema.parse({
        ...repeatedByKey,
        repeated: true,
      });
    }
    const player = discoverPlayersFixture.find(
      (item) => item.profileId === canonical.profileId,
    );
    if (!player)
      throw new DiscoverServiceError('not_found', 'Player not found');
    const invite = player.capabilities.invite;
    if (invite.state === 'unavailable' || !invite.targetSetId) {
      throw new DiscoverServiceError(
        'target_unavailable',
        'Player cannot be invited',
      );
    }
    if (invite.targetSetId !== canonical.setId) {
      throw new DiscoverServiceError(
        'invite_target_required',
        'Invite target Set does not match recommendation capability',
      );
    }
    const existing = this.inviteByProfile.get(player.profileId);
    if (existing) {
      const repeated = PlayerInviteReceiptSchema.parse({
        ...existing,
        repeated: true,
      });
      this.idempotency.set(canonical.idempotencyKey, repeated);
      return repeated;
    }
    const receipt = PlayerInviteReceiptSchema.parse({
      createdAt: this.clock.now(),
      inviteId: `invite-${player.profileId}`,
      profileId: player.profileId,
      repeated: false,
      setId: canonical.setId,
      status: 'pending',
    });
    this.inviteByProfile.set(player.profileId, receipt);
    this.idempotency.set(canonical.idempotencyKey, receipt);
    return receipt;
  }

  private response<T>(data: T, resource: string): DiscoverResponse<T> {
    this.requestCounter += 1;
    return {
      contractVersion: discoverContractVersion,
      data,
      meta: {
        generatedAt: this.clock.now(),
        requestId: `mock-${resource}-${this.requestCounter}`,
      },
    };
  }

  private withSetViewerState(items: readonly DiscoverSet[]) {
    return items.map((item) => {
      const receipt = this.joinBySet.get(item.id);
      return receipt
        ? {
            ...item,
            viewerState: {
              ...item.viewerState,
              joinRequestStatus: receipt.status,
            },
          }
        : item;
    });
  }

  private withPlayerViewerState(
    items: readonly DiscoverPlayerRecommendation[],
  ) {
    return items.map((item) => {
      const receipt = this.inviteByProfile.get(item.profileId);
      return receipt
        ? {
            ...item,
            capabilities: {
              ...item.capabilities,
              invite: {
                state: receipt.status,
                targetSetId: receipt.setId,
              },
            },
          }
        : item;
    });
  }
}

function canonicalOverviewParams(params: CanonicalDiscoverOverviewParams) {
  return {
    ...params,
    facetIds: [...params.facetIds].sort(),
    query: params.query.trim(),
  };
}

function byIds<T>(
  items: readonly T[],
  ids: readonly string[],
  getId: (item: T) => string,
) {
  return ids
    .map((id) => items.find((item) => getId(item) === id))
    .filter((item): item is T => Boolean(item));
}

function page<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
) {
  const offset = decodeCursor(cursor);
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const hasNextPage = nextOffset < items.length;
  return {
    items: slice,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? `discover:${nextOffset}` : null,
    },
    totalCount: items.length,
  };
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  const match = /^discover:(\d+)$/.exec(cursor);
  if (!match) throw new DiscoverServiceError('stale_cursor', 'Invalid cursor');
  return Number(match[1]);
}

function sortSets(
  items: readonly DiscoverSet[],
  sort: CanonicalDiscoverSetListParams['sort'],
  query: string,
) {
  const entries = items.map((item, index) => ({ index, item }));
  if (sort === 'best_match' && query.trim())
    return entries.map(({ item }) => item);
  return entries
    .sort((left, right) => {
      if (sort === 'newest') {
        return (
          Date.parse(right.item.openedAt) - Date.parse(left.item.openedAt) ||
          left.index - right.index
        );
      }
      if (sort === 'almost_full') {
        return (
          availableSlots(left.item) - availableSlots(right.item) ||
          right.item.matchScore - left.item.matchScore ||
          left.index - right.index
        );
      }
      return (
        right.item.matchScore - left.item.matchScore || left.index - right.index
      );
    })
    .map(({ item }) => item);
}

function availableSlots(item: DiscoverSet) {
  return Math.max(item.occupancy.capacity - item.occupancy.current, 0);
}

function parseContract<T>(
  schema: { parse: (value: unknown) => T },
  value: unknown,
) {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new DiscoverServiceError(
      'contract_violation',
      error instanceof Error ? error.message : 'Invalid Discover contract',
    );
  }
}
