import type { AuthSession } from '@/shared/auth/auth-service';

import type {
  CanonicalDiscoverOverviewParams,
  CanonicalDiscoverPlayerListParams,
  CanonicalDiscoverSetListParams,
  CanonicalDiscoverVibeListParams,
  DiscoverOverviewData,
  DiscoverPage,
  DiscoverPlayerRecommendation,
  DiscoverResponse,
  DiscoverSet,
  DiscoverVibe,
  InvitePlayerToSetCommand,
  PlayerInviteReceipt,
  RequestSetJoinCommand,
  SetJoinRequestReceipt,
} from '../contracts/discover-contracts';

export type DiscoverRequestContext = {
  locale: string;
  session: AuthSession | null;
  timezone: string;
  viewerId: string;
};

export type DiscoverCollectionCapability = Readonly<{
  filters: boolean;
  search: boolean;
  sorts: readonly ('best' | 'newest' | 'online' | 'popular' | 'ready')[];
}>;

export type DiscoverCapabilityDescriptor = Readonly<{
  collections: Readonly<{
    matches: DiscoverCollectionCapability;
    sets: DiscoverCollectionCapability;
    vibes: DiscoverCollectionCapability;
  }>;
  overview: Readonly<{
    filters: boolean;
    search: boolean;
    vibes: boolean;
  }>;
}>;

export const fullDiscoverCapabilities: DiscoverCapabilityDescriptor = {
  collections: {
    matches: {
      filters: true,
      search: true,
      sorts: ['best', 'online', 'newest'],
    },
    sets: {
      filters: true,
      search: true,
      sorts: ['best', 'ready', 'newest'],
    },
    vibes: {
      filters: true,
      search: true,
      sorts: ['popular', 'newest', 'best'],
    },
  },
  overview: { filters: true, search: true, vibes: true },
};

export const productionDiscoverCapabilities: DiscoverCapabilityDescriptor = {
  collections: {
    matches: { filters: false, search: false, sorts: ['best'] },
    sets: { filters: false, search: false, sorts: ['best'] },
    vibes: { filters: false, search: false, sorts: [] },
  },
  overview: { filters: false, search: false, vibes: false },
};

export interface DiscoverRepository {
  readonly capabilities: DiscoverCapabilityDescriptor;
  getOverview(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ): Promise<DiscoverResponse<DiscoverOverviewData>>;
  invitePlayerToSet(
    context: DiscoverRequestContext,
    command: InvitePlayerToSetCommand,
  ): Promise<PlayerInviteReceipt>;
  listPlayers(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ): Promise<DiscoverResponse<DiscoverPage<DiscoverPlayerRecommendation>>>;
  listSets(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverSetListParams,
  ): Promise<DiscoverResponse<DiscoverPage<DiscoverSet>>>;
  listVibes(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverVibeListParams,
  ): Promise<DiscoverResponse<DiscoverPage<DiscoverVibe>>>;
  requestSetJoin(
    context: DiscoverRequestContext,
    command: RequestSetJoinCommand,
  ): Promise<SetJoinRequestReceipt>;
}
