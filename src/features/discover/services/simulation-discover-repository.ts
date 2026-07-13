import {
  ProfileIdSchema,
  SetIdSchema,
  SIMULATION_OPERATION_IDS,
  inviteSimulationPlayerToSet,
  projectSimulationDiscover,
  requestSimulationSetJoin,
  type SimulationDiscoverPlayerProjection,
  type SimulationDiscoverSetProjection,
  type SimulationDiscoverVibeProjection,
  type SimulationWorld,
} from '@/entities/simulation';
import {
  SimulationRequestError,
  type SimulationOperationContext,
  type SimulationRuntime,
} from '@/shared/simulation';

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
  type RequestSetJoinCommand,
} from '../contracts/discover-contracts';
import {
  filterPlayers,
  filterSets,
  filterVibes,
} from '../model/discover-search';
import type {
  DiscoverRepository,
  DiscoverRequestContext,
} from './discover-repository';

export class SimulationDiscoverRepository implements DiscoverRepository {
  private requestSequence = 0;
  private readonly unregisterResetParticipant: () => void;

  constructor(private readonly runtime: SimulationRuntime<SimulationWorld>) {
    this.unregisterResetParticipant = runtime.registerResetParticipant({
      key: `${runtime.getNamespace()}.discover-repository`,
      reset: () => {
        this.requestSequence = 0;
      },
      snapshot: () => ({ requestSequence: this.requestSequence, version: 1 }),
      restore: (state) => {
        const candidate = state as {
          requestSequence?: unknown;
          version?: unknown;
        };
        this.requestSequence =
          candidate.version === 1 &&
          Number.isInteger(candidate.requestSequence) &&
          Number(candidate.requestSequence) >= 0
            ? Number(candidate.requestSequence)
            : 0;
      },
    });
  }

  dispose() {
    this.unregisterResetParticipant();
  }

  async getOverview(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ) {
    const canonical = {
      ...params,
      facetIds: [...params.facetIds].sort(),
      query: params.query.trim(),
    };
    return this.execute(
      SIMULATION_OPERATION_IDS.discover.overview,
      undefined,
      (context) => {
        const projection = projectSimulationDiscover(this.runtime.readWorld());
        const players = filterPlayers(
          projection.players.map(mapPlayer),
          canonical.query,
          canonical.facetIds,
        );
        const sets = filterSets(
          projection.sets.map(mapSet),
          canonical.query,
          canonical.facetIds,
        );
        const vibes = filterVibes(
          projection.vibes.map(mapVibe),
          canonical.query,
          canonical.facetIds,
        );
        const data: DiscoverOverviewData = {
          filterOptions: projection.filterOptions.map((item) => ({
            appliesTo: [...item.appliesTo],
            id: item.id,
            label: item.label,
          })),
          metrics: projection.metrics.map((item) => ({ ...item })),
          sections: {
            players: section(
              partialItems(players, context),
              players.length,
              canonical.previewLimit,
              'best_match',
            ),
            sets: section(
              partialItems(sets, context),
              sets.length,
              canonical.previewLimit,
              'best_match',
            ),
            vibes: section(
              partialItems(vibes, context),
              vibes.length,
              canonical.previewLimit,
              'popular',
            ),
          },
        };
        return DiscoverOverviewResponseSchema.parse(
          this.response(data, 'overview'),
        );
      },
    );
  }

  async listPlayers(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ) {
    const canonical = DiscoverPlayerListParamsSchema.parse(params);
    return this.execute(
      SIMULATION_OPERATION_IDS.discover.players,
      undefined,
      (context) => {
        let items = filterPlayers(
          projectSimulationDiscover(this.runtime.readWorld()).players.map(
            mapPlayer,
          ),
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
        return DiscoverPlayersResponseSchema.parse(
          this.response(
            page(
              partialItems(items, context),
              canonical.cursor,
              canonical.limit,
            ),
            'players',
          ),
        );
      },
    );
  }

  async listSets(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverSetListParams,
  ) {
    const canonical = DiscoverSetListParamsSchema.parse(params);
    return this.execute(
      SIMULATION_OPERATION_IDS.discover.sets,
      undefined,
      (context) => {
        let items = filterSets(
          projectSimulationDiscover(this.runtime.readWorld()).sets.map(mapSet),
          canonical.query,
          canonical.facetIds,
        );
        if (canonical.sort === 'newest') {
          items = [...items].sort((left, right) =>
            right.openedAt.localeCompare(left.openedAt),
          );
        } else if (canonical.sort === 'almost_full') {
          items = [...items].sort(
            (left, right) =>
              availableSlots(left) - availableSlots(right) ||
              right.matchScore - left.matchScore,
          );
        } else {
          items = [...items].sort(
            (left, right) => right.matchScore - left.matchScore,
          );
        }
        return DiscoverSetsResponseSchema.parse(
          this.response(
            page(
              partialItems(items, context),
              canonical.cursor,
              canonical.limit,
            ),
            'sets',
          ),
        );
      },
    );
  }

  async listVibes(
    _context: DiscoverRequestContext,
    params: CanonicalDiscoverVibeListParams,
  ) {
    const canonical = DiscoverVibeListParamsSchema.parse(params);
    return this.execute(
      SIMULATION_OPERATION_IDS.discover.vibes,
      undefined,
      (context) => {
        let items = filterVibes(
          projectSimulationDiscover(this.runtime.readWorld()).vibes.map(
            mapVibe,
          ),
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
        return DiscoverVibesResponseSchema.parse(
          this.response(
            page(
              partialItems(items, context),
              canonical.cursor,
              canonical.limit,
            ),
            'vibes',
          ),
        );
      },
    );
  }

  async requestSetJoin(
    _context: DiscoverRequestContext,
    command: RequestSetJoinCommand,
  ) {
    const canonical = RequestSetJoinCommandSchema.parse(command);
    const setId = SetIdSchema.parse(canonical.setId);
    return this.runtime
      .mutate(
        {
          operation: SIMULATION_OPERATION_IDS.discover.requestSetJoin,
          scope: setId,
        },
        (world, context) => {
          const set = world.sets[setId];
          if (!set) throw serviceError('not_found', 'Set not found.');
          if (
            canonical.expectedSetVersion !== undefined &&
            set.version !== canonical.expectedSetVersion
          ) {
            throw serviceError(
              'version_conflict',
              'Set version changed.',
              true,
            );
          }
          const result = requestSimulationSetJoin(world, {
            now: context.clock.now().toISOString(),
            profileId: world.viewerId,
            setId,
          });
          return SetJoinRequestReceiptSchema.parse({
            createdAt: context.clock.now().toISOString(),
            repeated: result.repeated,
            requestId: canonical.clientMutationId,
            setId,
            setVersion: result.set.version,
            status: 'pending',
          });
        },
      )
      .catch(throwDiscoverError);
  }

  async invitePlayerToSet(
    _context: DiscoverRequestContext,
    command: InvitePlayerToSetCommand,
  ) {
    const canonical = InvitePlayerToSetCommandSchema.parse(command);
    const setId = SetIdSchema.parse(canonical.setId);
    const profileId = ProfileIdSchema.parse(canonical.profileId);
    return this.runtime
      .mutate(
        {
          operation: SIMULATION_OPERATION_IDS.discover.invitePlayer,
          scope: setId,
        },
        (world, context) => {
          const set = world.sets[setId];
          if (!set) throw serviceError('not_found', 'Set not found.');
          if (
            canonical.expectedSetVersion !== undefined &&
            set.version !== canonical.expectedSetVersion
          ) {
            throw serviceError(
              'version_conflict',
              'Set version changed.',
              true,
            );
          }
          const recommendation = projectSimulationDiscover(world).players.find(
            (item) => item.profileId === profileId,
          );
          if (
            !recommendation ||
            recommendation.capabilities.invite.targetSetId !== setId
          ) {
            throw serviceError(
              'target_unavailable',
              'Player cannot be invited to this set.',
            );
          }
          const result = inviteSimulationPlayerToSet(world, {
            actorId: world.viewerId,
            now: context.clock.now().toISOString(),
            profileId,
            setId,
          });
          return PlayerInviteReceiptSchema.parse({
            createdAt: context.clock.now().toISOString(),
            inviteId: canonical.clientMutationId,
            profileId,
            repeated: result.repeated,
            setId,
            status: 'pending',
          });
        },
      )
      .catch(throwDiscoverError);
  }

  private execute<T>(
    operation: string,
    scope: string | undefined,
    task: (context: SimulationOperationContext) => T,
  ) {
    return this.runtime
      .execute({ operation, ...(scope ? { scope } : {}) }, task)
      .catch(throwDiscoverError);
  }

  private response<T>(data: T, resource: string): DiscoverResponse<T> {
    this.requestSequence += 1;
    return {
      contractVersion: discoverContractVersion,
      data,
      meta: {
        generatedAt: this.runtime.clock.now().toISOString(),
        requestId: `${this.runtime.getNamespace()}:discover:${resource}:${this.requestSequence}`,
      },
    };
  }
}

export function createSimulationDiscoverRepository(
  runtime: SimulationRuntime<SimulationWorld>,
) {
  return new SimulationDiscoverRepository(runtime);
}

function mapPlayer(
  item: SimulationDiscoverPlayerProjection,
): DiscoverPlayerRecommendation {
  return {
    avatar: media(item.avatar),
    capabilities: {
      canMessage: item.capabilities.canMessage,
      canViewProfile: item.capabilities.canViewProfile,
      invite: { ...item.capabilities.invite },
    },
    conversationId: item.conversationId,
    displayName: item.displayName,
    facetIds: [...item.facetIds],
    matchReasons: item.matchReasons.map((reason) => ({ ...reason })),
    matchScore: item.matchScore,
    onlineStatus: item.onlineStatus,
    ...(item.primaryRole ? { primaryRole: { ...item.primaryRole } } : {}),
    profileId: item.profileId,
    rank: { ...item.rank },
  };
}

function mapSet(item: SimulationDiscoverSetProjection): DiscoverSet {
  return {
    artwork: media(item.artwork),
    communication: { ...item.communication },
    facetIds: [...item.facetIds],
    id: item.id,
    matchScore: item.matchScore,
    members: {
      preview: item.members.preview.map((member) => ({
        id: member.id,
        media: media(member.media),
      })),
      totalCount: item.members.totalCount,
    },
    mode: item.mode,
    occupancy: { ...item.occupancy },
    openedAt: item.openedAt,
    recruitment: {
      missingRoles: item.recruitment.missingRoles.map((role) => ({ ...role })),
      requiresApproval: item.recruitment.requiresApproval,
      requiresRoleSelection: item.recruitment.requiresRoleSelection,
      status: item.recruitment.status,
    },
    tags: item.tags.map((tag) => ({ ...tag })),
    title: item.title,
    version: item.version,
    viewerState: { ...item.viewerState },
  };
}

function mapVibe(item: SimulationDiscoverVibeProjection): DiscoverVibe {
  return {
    activityType: item.activityType,
    artwork: media(item.artwork),
    engagement: { ...item.engagement },
    facetIds: [...item.facetIds],
    id: item.id,
    participants: {
      preview: item.participants.preview.map((participant) => ({
        id: participant.id,
        media: media(participant.media),
      })),
      totalCount: item.participants.totalCount,
    },
    slug: item.slug,
    title: item.title,
  };
}

function media(item: {
  altText: string;
  assetKey: string;
  height?: number;
  width?: number;
}) {
  return {
    altText: item.altText,
    assetKey: item.assetKey,
    ...(item.height === undefined ? {} : { height: item.height }),
    kind: 'fixture' as const,
    ...(item.width === undefined ? {} : { width: item.width }),
  };
}

function section<T>(
  items: readonly T[],
  totalCount: number,
  limit: number,
  defaultSort: string,
) {
  return {
    defaultSort,
    items: items.slice(0, limit),
    totalCount,
  };
}

function page<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
) {
  const offset = parseCursor(cursor);
  if (offset > items.length) {
    throw serviceError('stale_cursor', 'Discover cursor is stale.', true);
  }
  const selected = items.slice(offset, offset + limit);
  const nextOffset = offset + selected.length;
  return {
    items: selected,
    pageInfo: {
      hasNextPage: nextOffset < items.length,
      nextCursor:
        nextOffset < items.length ? `discover:v1:${nextOffset}` : null,
    },
    totalCount: items.length,
  } satisfies DiscoverPage<T>;
}

function parseCursor(cursor?: string) {
  if (!cursor) return 0;
  const match = /^discover:v1:(\d+)$/.exec(cursor);
  if (!match)
    throw serviceError('stale_cursor', 'Invalid Discover cursor.', true);
  return Number(match[1]);
}

function partialItems<T>(
  items: readonly T[],
  context: Pick<SimulationOperationContext, 'fault'>,
) {
  if (context.fault?.kind !== 'partial_response') return [...items];
  if (context.fault.limit !== undefined)
    return items.slice(0, context.fault.limit);
  return items.slice(
    0,
    Math.floor(items.length * (context.fault.ratio ?? 0.5)),
  );
}

function availableSlots(item: DiscoverSet) {
  return Math.max(item.occupancy.capacity - item.occupancy.current, 0);
}

function serviceError(
  code: ConstructorParameters<typeof DiscoverServiceError>[0],
  message: string,
  retryable = false,
) {
  return new DiscoverServiceError(code, message, retryable);
}

function throwDiscoverError(error: unknown): never {
  if (error instanceof DiscoverServiceError) throw error;
  if (error instanceof SimulationRequestError) {
    if (error.code === 'stale_cursor') {
      throw serviceError('stale_cursor', error.message, true);
    }
    if (error.code === 'validation_error') {
      throw serviceError('validation_failed', error.message, false);
    }
    throw serviceError('network_error', error.message, error.retryable);
  }
  throw error;
}
