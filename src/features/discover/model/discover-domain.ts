import type { ImageSourcePropType } from 'react-native';

import type { ResolvedAsset } from '@/entities/media-asset';

import type { DiscoverFilterId } from '../contracts/discover-contracts';

export type { DiscoverFilterId } from '../contracts/discover-contracts';

export type DiscoverResolvedMedia =
  | { kind: 'asset'; resolved: ResolvedAsset }
  | { kind: 'remote'; source: ImageSourcePropType; state: 'ready' }
  | { kind: 'unresolved'; state: 'missing' };

export function discoverResolvedMediaSource(
  media: DiscoverResolvedMedia,
): ImageSourcePropType | undefined {
  if (media.kind === 'asset') return media.resolved.source;
  if (media.kind === 'remote') return media.source;
  return undefined;
}

export function discoverResolvedMediaState(media: DiscoverResolvedMedia) {
  return media.kind === 'asset' ? media.resolved.state : media.state;
}

export type DiscoverFilterChip = {
  icon: string;
  id: DiscoverFilterId;
  label: string;
};

export type DiscoverVibeCard = {
  background: DiscoverResolvedMedia;
  filterIds: readonly DiscoverFilterId[];
  id: string;
  interestedLabel: string;
  participantSources: readonly DiscoverResolvedMedia[];
  surplusLabel: string;
  title: string;
};

export type DiscoverSetCard = {
  actionKind: 'request' | 'view';
  actionLabel: string;
  actionState: 'idle' | 'pending';
  actionTone: 'cyan' | 'purple';
  avatarSources: readonly DiscoverResolvedMedia[];
  badgeLabel: string;
  badgeTone: 'cyan' | 'orange';
  filterIds: readonly DiscoverFilterId[];
  id: string;
  image: DiscoverResolvedMedia;
  matchScore: number;
  meta: string;
  openedMinutesAgo: number;
  slots: string;
  statusKind: 'mic' | 'online';
  statusLabel: string;
  tags: readonly string[];
  title: string;
  version: number;
};

export type DiscoverProfileCard = {
  actionKind: 'invite' | 'like' | 'liked' | 'view';
  actionLabel: string;
  actionState: 'idle' | 'pending';
  actionTone: 'cyan' | 'purple';
  avatar: DiscoverResolvedMedia;
  canPass?: boolean;
  conversationId?: string;
  intentVersion?: number;
  filterIds: readonly DiscoverFilterId[];
  id: string;
  match: string;
  name: string;
  online: boolean;
  playerId?: string;
  profileVersion?: number;
  subtitle: string;
  tags: readonly string[];
  targetSetId?: string;
};

export type DiscoverMetricCard = {
  accent: 'cyan' | 'mint' | 'pink' | 'purple';
  id: string;
  label: string;
  title: string;
};

export type DiscoverContent = {
  profiles: readonly DiscoverProfileCard[];
  sets: readonly DiscoverSetCard[];
  vibes: readonly DiscoverVibeCard[];
};

export type DiscoverOverviewViewModel = DiscoverContent & {
  filterChips: readonly DiscoverFilterChip[];
  metrics: readonly DiscoverMetricCard[];
};

export type DiscoverSetSortId = 'almost-full' | 'best-match' | 'newest';
export type DiscoverVibeSortId = 'best-match' | 'newest' | 'popular';
export type DiscoverPlayerSortId = 'best-match' | 'newest' | 'online';
