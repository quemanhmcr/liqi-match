import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/shared/auth/auth-context';

import type {
  DiscoverOverviewParams,
  DiscoverPlayerListParams,
  DiscoverSetListParams,
  DiscoverVibeListParams,
} from '../contracts/discover-contracts';
import {
  canonicalizeOverviewParams,
  canonicalizePlayerParams,
  canonicalizeSetParams,
  canonicalizeVibeParams,
  fetchDiscoverOverview,
  fetchDiscoverPlayers,
  fetchDiscoverSets,
  fetchDiscoverVibes,
  getInitialDiscoverOverview,
  getInitialDiscoverPlayers,
  getInitialDiscoverSets,
  getInitialDiscoverVibes,
  inviteDiscoverPlayer,
  requestDiscoverSetJoin,
} from '../services/discover-service';
import type { DiscoverRequestContext } from '../services/discover-repository';
import { discoverQueryKeys } from './discover-query-keys';

export function useDiscoverOverviewQuery(params: DiscoverOverviewParams) {
  const context = useDiscoverRequestContext();
  const canonical = canonicalizeOverviewParams(params);
  return useQuery({
    initialData: () => getInitialDiscoverOverview(context, canonical),
    queryFn: () => fetchDiscoverOverview(context, canonical),
    queryKey: discoverQueryKeys.overview(context.viewerId, canonical),
  });
}

export function useDiscoverVibesQuery(params: DiscoverVibeListParams) {
  const context = useDiscoverRequestContext();
  const canonical = canonicalizeVibeParams(params);
  return useQuery({
    initialData: () => getInitialDiscoverVibes(context, canonical),
    queryFn: () => fetchDiscoverVibes(context, canonical),
    queryKey: discoverQueryKeys.vibes(context.viewerId, canonical),
  });
}

export function useDiscoverSetsQuery(params: DiscoverSetListParams) {
  const context = useDiscoverRequestContext();
  const canonical = canonicalizeSetParams(params);
  return useQuery({
    initialData: () => getInitialDiscoverSets(context, canonical),
    queryFn: () => fetchDiscoverSets(context, canonical),
    queryKey: discoverQueryKeys.sets(context.viewerId, canonical),
  });
}

export function useDiscoverPlayersQuery(params: DiscoverPlayerListParams) {
  const context = useDiscoverRequestContext();
  const canonical = canonicalizePlayerParams(params);
  return useQuery({
    initialData: () => getInitialDiscoverPlayers(context, canonical),
    queryFn: () => fetchDiscoverPlayers(context, canonical),
    queryKey: discoverQueryKeys.players(context.viewerId, canonical),
  });
}

export function useRequestSetJoinMutation() {
  const context = useDiscoverRequestContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, version }: { setId: string; version?: number }) => {
      const mutationId = createMutationId('join', context.viewerId, setId);
      return requestDiscoverSetJoin(context, {
        clientMutationId: mutationId,
        expectedSetVersion: version,
        idempotencyKey: mutationId,
        setId,
        source: 'discover',
      });
    },
    onSuccess: (receipt) => {
      queryClient.setQueriesData(
        { queryKey: discoverQueryKeys.root },
        (current) => updateSetActionState(current, receipt.setId),
      );
    },
  });
}

export function useInvitePlayerMutation() {
  const context = useDiscoverRequestContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      setId,
      version,
    }: {
      profileId: string;
      setId: string;
      version?: number;
    }) => {
      const mutationId = createMutationId(
        'invite',
        context.viewerId,
        profileId,
      );
      return inviteDiscoverPlayer(context, {
        clientMutationId: mutationId,
        expectedSetVersion: version,
        idempotencyKey: mutationId,
        profileId,
        setId,
        source: 'discover',
      });
    },
    onSuccess: (receipt) => {
      queryClient.setQueriesData(
        { queryKey: discoverQueryKeys.root },
        (current) => updatePlayerActionState(current, receipt.profileId),
      );
    },
  });
}

function useDiscoverRequestContext(): DiscoverRequestContext {
  const { session } = useAuth();
  return {
    locale: 'vi',
    session,
    timezone: safeTimezone(),
    viewerId: session?.user.id ?? 'preview',
  };
}

function safeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

let mutationSequence = 0;
function createMutationId(kind: string, viewerId: string, resourceId: string) {
  mutationSequence += 1;
  return `${kind}:${viewerId}:${resourceId}:${mutationSequence}`;
}

export type DiscoverCollectionKind = 'matches' | 'sets' | 'vibes';
export type DiscoverCollectionSortId =
  'best' | 'newest' | 'online' | 'popular' | 'ready';

export function useDiscoverCollectionQuery(
  kind: DiscoverCollectionKind,
  params: {
    facetIds: DiscoverOverviewParams['facetIds'];
    query: string;
    sort: DiscoverCollectionSortId;
  },
) {
  const context = useDiscoverRequestContext();
  const vibeParams = canonicalizeVibeParams({
    facetIds: params.facetIds,
    limit: 50,
    query: params.query,
    sort:
      params.sort === 'newest'
        ? 'newest'
        : params.sort === 'popular'
          ? 'popular'
          : 'best_match',
  });
  const setParams = canonicalizeSetParams({
    facetIds: params.facetIds,
    limit: 50,
    query: params.query,
    sort:
      params.sort === 'newest'
        ? 'newest'
        : params.sort === 'ready'
          ? 'almost_full'
          : 'best_match',
  });
  const playerParams = canonicalizePlayerParams({
    facetIds: params.facetIds,
    limit: 50,
    query: params.query,
    sort:
      params.sort === 'newest'
        ? 'newest'
        : params.sort === 'online'
          ? 'online'
          : 'best_match',
  });

  return useQuery({
    initialData: () => {
      if (kind === 'vibes') return getInitialDiscoverVibes(context, vibeParams);
      if (kind === 'sets') return getInitialDiscoverSets(context, setParams);
      return getInitialDiscoverPlayers(context, playerParams);
    },
    queryFn: () => {
      if (kind === 'vibes') return fetchDiscoverVibes(context, vibeParams);
      if (kind === 'sets') return fetchDiscoverSets(context, setParams);
      return fetchDiscoverPlayers(context, playerParams);
    },
    queryKey:
      kind === 'vibes'
        ? discoverQueryKeys.vibes(context.viewerId, vibeParams)
        : kind === 'sets'
          ? discoverQueryKeys.sets(context.viewerId, setParams)
          : discoverQueryKeys.players(context.viewerId, playerParams),
  });
}

type ActionStateCard = { actionState: 'idle' | 'pending'; id: string };

type DiscoverCacheShape = {
  items?: unknown[];
  profiles?: unknown[];
  sets?: unknown[];
};

function updateSetActionState(current: unknown, setId: string) {
  if (!isCacheShape(current)) return current;
  if (Array.isArray(current.sets)) {
    return {
      ...current,
      sets: current.sets.map((item) =>
        isActionStateCard(item) && item.id === setId
          ? { ...item, actionState: 'pending' as const }
          : item,
      ),
    };
  }
  if (Array.isArray(current.items)) {
    return {
      ...current,
      items: current.items.map((item) =>
        isActionStateCard(item) && item.id === setId && 'version' in item
          ? { ...item, actionState: 'pending' as const }
          : item,
      ),
    };
  }
  return current;
}

function updatePlayerActionState(current: unknown, profileId: string) {
  if (!isCacheShape(current)) return current;
  if (Array.isArray(current.profiles)) {
    return {
      ...current,
      profiles: current.profiles.map((item) =>
        isActionStateCard(item) && item.id === profileId
          ? { ...item, actionState: 'pending' as const }
          : item,
      ),
    };
  }
  if (Array.isArray(current.items)) {
    return {
      ...current,
      items: current.items.map((item) =>
        isActionStateCard(item) && item.id === profileId && !('version' in item)
          ? { ...item, actionState: 'pending' as const }
          : item,
      ),
    };
  }
  return current;
}

function isCacheShape(value: unknown): value is DiscoverCacheShape {
  return typeof value === 'object' && value !== null;
}

function isActionStateCard(value: unknown): value is ActionStateCard {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'actionState' in value
  );
}
