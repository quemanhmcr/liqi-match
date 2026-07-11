import type {
  DiscoverFilterOption,
  DiscoverMedia,
  DiscoverMetric,
  DiscoverOverviewData,
  DiscoverPlayerRecommendation,
  DiscoverSet,
  DiscoverVibe,
} from '../contracts/discover-contracts';
import { resolveDiscoverAsset } from '../data/discover-assets';
import type {
  DiscoverFilterChip,
  DiscoverMetricCard,
  DiscoverOverviewViewModel,
  DiscoverProfileCard,
  DiscoverSetCard,
  DiscoverVibeCard,
} from './discover-domain';

const filterIcons: Record<string, string> = {
  all: 'sparkles-outline',
  mic: 'mic-outline',
  'non-toxic': 'happy-outline',
  rank: 'trophy-outline',
  soulmate: 'heart-outline',
  'team-rank': 'people-outline',
};

const profileToneOverrides: Record<string, 'cyan' | 'purple'> = {
  'an-nhi-adc': 'cyan',
  'huy-top': 'purple',
  'khoa-jungle': 'cyan',
  'lyra-mid': 'purple',
  'minh-anh': 'purple',
  'nam-support': 'cyan',
};

export function presentFilterChips(
  options: readonly DiscoverFilterOption[],
): DiscoverFilterChip[] {
  return [
    { icon: filterIcons.all!, id: 'all', label: 'Tất cả' },
    ...options.map((option) => ({
      icon: filterIcons[option.id] ?? 'options-outline',
      id: option.id,
      label: option.label,
    })),
  ];
}

export function presentVibe(vibe: DiscoverVibe): DiscoverVibeCard {
  const previewCount = vibe.participants.preview.length;
  const surplus = Math.max(vibe.participants.totalCount - previewCount, 0);
  return {
    background: resolveMedia(vibe.artwork),
    filterIds: vibe.facetIds,
    id: vibe.id,
    interestedLabel: formatVibeEngagement(vibe),
    participantSources: vibe.participants.preview.map((item) =>
      resolveMedia(item.media),
    ),
    surplusLabel: surplus ? `+${surplus}` : '',
    title: vibe.title,
  };
}

export function presentSet(
  set: DiscoverSet,
  generatedAt: string,
): DiscoverSetCard {
  const directRequest =
    set.viewerState.canRequestJoin &&
    !set.recruitment.requiresApproval &&
    !set.recruitment.requiresRoleSelection &&
    set.recruitment.status === 'open';
  const actionKind = directRequest ? 'request' : 'view';
  const missingRole = set.recruitment.missingRoles[0]?.name;
  return {
    actionKind,
    actionLabel: actionKind === 'request' ? 'Xin vào' : 'Xem set',
    actionState:
      set.viewerState.joinRequestStatus === 'pending' ? 'pending' : 'idle',
    actionTone: actionKind === 'request' ? 'cyan' : 'purple',
    avatarSources: set.members.preview.map((item) => resolveMedia(item.media)),
    badgeLabel: set.mode === 'team_rank' ? 'Team Rank' : 'Rank',
    badgeTone: set.mode === 'team_rank' ? 'orange' : 'cyan',
    filterIds: set.facetIds,
    id: set.id,
    image: resolveMedia(set.artwork),
    matchScore: set.matchScore,
    meta: missingRole ? `Thiếu ${missingRole}` : 'Đang tuyển',
    openedMinutesAgo: minutesBetween(set.openedAt, generatedAt),
    slots: `${set.occupancy.current}/${set.occupancy.capacity}`,
    statusKind: set.communication.voicePolicy === 'off' ? 'online' : 'mic',
    statusLabel:
      set.communication.voicePolicy === 'off'
        ? 'Online'
        : set.communication.voicePolicy === 'required'
          ? 'Mic on'
          : 'Mic ưu tiên',
    tags: set.tags.map((tag) => tag.label),
    title: set.title,
    version: set.version,
  };
}

export function presentPlayer(
  player: DiscoverPlayerRecommendation,
): DiscoverProfileCard {
  const inviteState = player.capabilities.invite.state;
  const actionKind = inviteState === 'unavailable' ? 'view' : 'invite';
  return {
    actionKind,
    actionLabel: actionKind === 'invite' ? 'Mời vào' : 'Xem hồ sơ',
    actionState: inviteState === 'pending' ? 'pending' : 'idle',
    actionTone:
      profileToneOverrides[player.profileId] ??
      (actionKind === 'invite' ? 'cyan' : 'purple'),
    avatar: resolveMedia(player.avatar),
    filterIds: player.facetIds,
    id: player.profileId,
    match: `Hợp vibe ${player.matchScore}%`,
    name: player.displayName,
    online: player.onlineStatus === 'online',
    subtitle: [player.rank?.name, player.primaryRole?.name]
      .filter(Boolean)
      .join(' · '),
    tags: player.matchReasons.map((reason) => reason.label),
    targetSetId: player.capabilities.invite.targetSetId,
  };
}

export function presentMetric(metric: DiscoverMetric): DiscoverMetricCard {
  const presentation = {
    hot_hero: { accent: 'pink' as const, id: 'hot-hero' },
    online_players: { accent: 'mint' as const, id: 'online-players' },
    open_sets: { accent: 'purple' as const, id: 'open-sets' },
  }[metric.kind];
  return {
    accent: presentation.accent,
    id: presentation.id,
    label: metric.label,
    title: String(metric.value),
  };
}

export function presentOverview(
  overview: DiscoverOverviewData,
  generatedAt: string,
): DiscoverOverviewViewModel {
  return {
    filterChips: presentFilterChips(overview.filterOptions),
    metrics: overview.metrics.map(presentMetric),
    profiles: overview.sections.players.items.map(presentPlayer),
    sets: overview.sections.sets.items.map((set) =>
      presentSet(set, generatedAt),
    ),
    vibes: overview.sections.vibes.items.map(presentVibe),
  };
}

function resolveMedia(media: DiscoverMedia) {
  if (media.kind === 'fixture') return resolveDiscoverAsset(media.assetKey);
  return { uri: media.url };
}

function formatVibeEngagement(vibe: DiscoverVibe) {
  if (vibe.engagement.kind === 'open_sets') {
    return `${vibe.engagement.count} set đang mở`;
  }
  if (vibe.engagement.kind === 'teams_recruiting') {
    return `${vibe.engagement.count} team đang tìm`;
  }
  return `${vibe.engagement.count} người quan tâm`;
}

function minutesBetween(start: string, end: string) {
  const diff = Date.parse(end) - Date.parse(start);
  return Math.max(Math.round(diff / 60_000), 0);
}
