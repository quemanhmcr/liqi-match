import type { ImageSourcePropType } from 'react-native';

import type { DiscoverFilterId } from '../contracts/discover-contracts';

export type { DiscoverFilterId } from '../contracts/discover-contracts';

export type DiscoverFilterChip = {
  icon: string;
  id: DiscoverFilterId;
  label: string;
};

export type DiscoverVibeCard = {
  background: ImageSourcePropType;
  filterIds: readonly DiscoverFilterId[];
  id: string;
  interestedLabel: string;
  participantSources: readonly ImageSourcePropType[];
  surplusLabel: string;
  title: string;
};

export type DiscoverSetCard = {
  actionKind: 'request' | 'view';
  actionLabel: string;
  actionState: 'idle' | 'pending';
  actionTone: 'cyan' | 'purple';
  avatarSources: readonly ImageSourcePropType[];
  badgeLabel: string;
  badgeTone: 'cyan' | 'orange';
  filterIds: readonly DiscoverFilterId[];
  id: string;
  image: ImageSourcePropType;
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
  actionKind: 'invite' | 'view';
  actionLabel: string;
  actionState: 'idle' | 'pending';
  actionTone: 'cyan' | 'purple';
  avatar: ImageSourcePropType;
  filterIds: readonly DiscoverFilterId[];
  id: string;
  match: string;
  name: string;
  online: boolean;
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
