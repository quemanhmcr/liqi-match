import type {
  CanonicalDiscoverOverviewParams,
  CanonicalDiscoverPlayerListParams,
  CanonicalDiscoverSetListParams,
  CanonicalDiscoverVibeListParams,
} from '../contracts/discover-contracts';

export const discoverQueryKeys = {
  overview: (viewerId: string, params: CanonicalDiscoverOverviewParams) =>
    ['discover', 'overview', viewerId, params] as const,
  players: (viewerId: string, params: CanonicalDiscoverPlayerListParams) =>
    ['discover', 'players', viewerId, params] as const,
  root: ['discover'] as const,
  sets: (viewerId: string, params: CanonicalDiscoverSetListParams) =>
    ['discover', 'sets', viewerId, params] as const,
  vibes: (viewerId: string, params: CanonicalDiscoverVibeListParams) =>
    ['discover', 'vibes', viewerId, params] as const,
};
