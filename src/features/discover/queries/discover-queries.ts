import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  useAssetResolver,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
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
  inviteDiscoverPlayer,
  requestDiscoverSetJoin,
} from '../services/discover-service';
import type { DiscoverRequestContext } from '../services/discover-repository';
import { useDiscoverRepository } from '../runtime/DiscoverRepositoryProvider';
import { discoverQueryKeys } from './discover-query-keys';

export function useDiscoverOverviewQuery(params: DiscoverOverviewParams) {
  const repository = useDiscoverRepository();
  const assetResolver = useDiscoverAssetResolver();
  const context = useDiscoverRequestContext();
  const canonical = canonicalizeOverviewParams(params);
  return useQuery({
    queryFn: () =>
      fetchDiscoverOverview(repository, assetResolver, context, canonical),
    queryKey: discoverQueryKeys.overview(context.viewerId, canonical),
  });
}

export function useDiscoverVibesQuery(params: DiscoverVibeListParams) {
  const repository = useDiscoverRepository();
  const assetResolver = useDiscoverAssetResolver();
  const context = useDiscoverRequestContext();
  const canonical = canonicalizeVibeParams(params);
  return useQuery({
    queryFn: () =>
      fetchDiscoverVibes(repository, assetResolver, context, canonical),
    queryKey: discoverQueryKeys.vibes(context.viewerId, canonical),
  });
}

export function useDiscoverSetsQuery(params: DiscoverSetListParams) {
  const repository = useDiscoverRepository();
  const assetResolver = useDiscoverAssetResolver();
  const context = useDiscoverRequestContext();
  const canonical = canonicalizeSetParams(params);
  return useQuery({
    queryFn: () =>
      fetchDiscoverSets(repository, assetResolver, context, canonical),
    queryKey: discoverQueryKeys.sets(context.viewerId, canonical),
  });
}

export function useDiscoverPlayersQuery(params: DiscoverPlayerListParams) {
  const repository = useDiscoverRepository();
  const assetResolver = useDiscoverAssetResolver();
  const context = useDiscoverRequestContext();
  const canonical = canonicalizePlayerParams(params);
  return useQuery({
    queryFn: () =>
      fetchDiscoverPlayers(repository, assetResolver, context, canonical),
    queryKey: discoverQueryKeys.players(context.viewerId, canonical),
  });
}

export function useRequestSetJoinMutation() {
  const repository = useDiscoverRepository();
  const context = useDiscoverRequestContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, version }: { setId: string; version?: number }) => {
      const mutationId = createMutationId('join', context.viewerId, setId);
      return requestDiscoverSetJoin(repository, context, {
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
  const repository = useDiscoverRepository();
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
      return inviteDiscoverPlayer(repository, context, {
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

function useDiscoverAssetResolver() {
  usePreloadAssetSurface('discover');
  return useAssetResolver();
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

type DiscoverCollectionPage =
  | Awaited<ReturnType<typeof fetchDiscoverPlayers>>
  | Awaited<ReturnType<typeof fetchDiscoverSets>>
  | Awaited<ReturnType<typeof fetchDiscoverVibes>>;

export function useDiscoverCollectionQuery(
  kind: DiscoverCollectionKind,
  params: {
    facetIds: DiscoverOverviewParams['facetIds'];
    query: string;
    sort: DiscoverCollectionSortId;
  },
) {
  const repository = useDiscoverRepository();
  const assetResolver = useDiscoverAssetResolver();
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

  return useQuery<DiscoverCollectionPage>({
    queryFn: () => {
      if (kind === 'vibes') {
        return fetchDiscoverVibes(
          repository,
          assetResolver,
          context,
          vibeParams,
        );
      }
      if (kind === 'sets') {
        return fetchDiscoverSets(repository, assetResolver, context, setParams);
      }
      return fetchDiscoverPlayers(
        repository,
        assetResolver,
        context,
        playerParams,
      );
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
