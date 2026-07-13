import {
  HERO_DOMAIN_CATALOG,
  heroDefinitionById,
  type HeroId,
} from '@/entities/hero';
import {
  LANE_CATALOG,
  RANK_CATALOG,
  catalogOptionById,
  type LaneSlug,
  type RankId,
} from '@/entities/player-profile';

import type {
  AssetKey,
  ConversationId,
  MatchId,
  ProfileId,
  SetId,
} from './identity';
import type {
  SimulatedConversation,
  SimulatedDiscoverFacet,
  SimulatedMatch,
  SimulatedMatchKind,
  SimulatedOnlineStatus,
  SimulatedProfile,
  SimulatedSet,
  SimulationWorldSnapshot,
} from './world-schema';

export class SimulationProjectionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'asset_missing'
      | 'conversation_missing'
      | 'profile_missing'
      | 'viewer_missing',
  ) {
    super(message);
    this.name = 'SimulationProjectionError';
  }
}

export type SimulationMediaProjection = Readonly<{
  altText: string;
  assetKey: AssetKey;
  height?: number;
  kind: 'fixture';
  state: 'available' | 'corrupt' | 'missing' | 'unassociated';
  width?: number;
}>;

export type SimulationProfileProjection = Readonly<{
  avatar: SimulationMediaProjection | null;
  bio: string;
  cover: SimulationMediaProjection | null;
  displayName: string;
  favoriteHeroes: readonly Readonly<{
    heroId: HeroId;
    name: string;
    priority: number;
  }>[];
  gameHandle: string;
  gender: 'female' | 'hidden' | 'male';
  id: ProfileId;
  playStyleTags: readonly string[];
  rank: Readonly<{ id: RankId; label: string }>;
  region: string;
  roles: readonly Readonly<{ id: LaneSlug; label: string }>[];
  stats: Readonly<{
    matches: number;
    rating: number;
    reputation: number;
    winRate: number;
  }>;
  status: Readonly<{
    label: string;
    value: 'busy' | 'friends' | 'offline' | 'ready';
  }>;
  verified: boolean;
  wall: readonly SimulationMediaProjection[];
}>;

export type SimulationHomeProjection = Readonly<{
  activeMatchCount: number;
  connections: readonly Readonly<{
    avatar: SimulationMediaProjection | null;
    conversationId: ConversationId | null;
    createdAt: string;
    heroNames: readonly string[];
    id: MatchId;
    kind: 'Normal' | 'Rank' | 'Set Love' | 'Team Rank' | 'Tri kỉ';
    meta: string;
    name: string;
    profileId: ProfileId;
    rankName: string;
    roleNames: readonly string[];
    status: 'idle' | 'offline' | 'online' | 'ready';
    subtitle: string;
    unreadCount: number;
  }>[];
  currentProfile: Readonly<{
    avatar: SimulationMediaProjection | null;
    displayName: string;
    handle: string;
    rankName: string;
    readySummary: string;
    roleNames: readonly string[];
  }>;
  preview: false;
}>;

export type SimulationDiscoverRoleReference = Readonly<{
  id: string;
  name: string;
}>;

export type SimulationDiscoverPlayerProjection = Readonly<{
  avatar: SimulationMediaProjection;
  capabilities: Readonly<{
    canMessage: boolean;
    canViewProfile: boolean;
    invite: Readonly<{
      state:
        | 'accepted'
        | 'available'
        | 'cancelled'
        | 'declined'
        | 'pending'
        | 'unavailable';
      targetSetId?: SetId;
    }>;
  }>;
  displayName: string;
  facetIds: readonly SimulatedDiscoverFacet[];
  matchReasons: readonly Readonly<{ code: string; label: string }>[];
  matchScore: number;
  onlineStatus: SimulatedOnlineStatus;
  primaryRole?: SimulationDiscoverRoleReference;
  profileId: ProfileId;
  rank: SimulationDiscoverRoleReference;
}>;

export type SimulationDiscoverSetProjection = Readonly<{
  artwork: SimulationMediaProjection;
  communication: Readonly<{
    voicePolicy: 'off' | 'preferred' | 'required';
  }>;
  facetIds: readonly SimulatedDiscoverFacet[];
  id: SetId;
  matchScore: number;
  members: Readonly<{
    preview: readonly Readonly<{
      id: ProfileId;
      media: SimulationMediaProjection;
    }>[];
    totalCount: number;
  }>;
  mode: 'rank' | 'team_rank';
  occupancy: Readonly<{ capacity: number; current: number }>;
  openedAt: string;
  recruitment: Readonly<{
    missingRoles: readonly SimulationDiscoverRoleReference[];
    requiresApproval: boolean;
    requiresRoleSelection: boolean;
    status: 'closed' | 'full' | 'open';
  }>;
  tags: readonly Readonly<{
    id: string;
    kind: 'hero' | 'other' | 'role' | 'schedule' | 'trait';
    label: string;
  }>[];
  title: string;
  version: number;
  viewerState: Readonly<{
    canRequestJoin: boolean;
    canViewDetails: boolean;
    joinRequestStatus:
      'accepted' | 'cancelled' | 'declined' | 'none' | 'pending';
    relationship: 'member' | 'none' | 'owner';
  }>;
}>;

export type SimulationDiscoverVibeProjection = Readonly<{
  activityType: 'casual' | 'duo' | 'ranked' | 'social' | 'team_recruitment';
  artwork: SimulationMediaProjection;
  engagement: Readonly<{
    count: number;
    kind: 'interested_players' | 'open_sets' | 'teams_recruiting';
  }>;
  facetIds: readonly SimulatedDiscoverFacet[];
  id: string;
  participants: Readonly<{
    preview: readonly Readonly<{
      id: ProfileId;
      media: SimulationMediaProjection;
    }>[];
    totalCount: number;
  }>;
  slug: string;
  title: string;
}>;

export type SimulationDiscoverProjection = Readonly<{
  filterOptions: readonly Readonly<{
    appliesTo: readonly ('players' | 'sets' | 'vibes')[];
    id: SimulatedDiscoverFacet;
    label: string;
  }>[];
  metrics: readonly Readonly<{
    kind: 'hot_hero' | 'online_players' | 'open_sets';
    label: string;
    value: number | string;
  }>[];
  players: readonly SimulationDiscoverPlayerProjection[];
  sets: readonly SimulationDiscoverSetProjection[];
  vibes: readonly SimulationDiscoverVibeProjection[];
}>;

export function projectSimulationProfile(
  world: SimulationWorldSnapshot,
  profileId: ProfileId = world.viewerId,
): SimulationProfileProjection {
  const profile = requireProfile(world, profileId);
  const canonical = profile.canonicalProfile;
  const roleIds = [
    canonical.laneSelection.primary,
    ...(canonical.laneSelection.secondary
      ? [canonical.laneSelection.secondary]
      : []),
  ];

  return {
    avatar: mediaProjection(world, profile.media.avatarAssetKey),
    bio: profile.bio,
    cover: mediaProjection(world, profile.media.coverAssetKey),
    displayName: canonical.profileBasics.displayName,
    favoriteHeroes: canonical.favoriteHeroes.map((favorite) => ({
      heroId: favorite.heroId,
      name: heroDefinitionById(favorite.heroId)?.name ?? favorite.heroId,
      priority: favorite.priority,
    })),
    gameHandle: canonical.profileBasics.gameHandle,
    gender: canonical.profileBasics.genderId,
    id: profile.id,
    playStyleTags: [...profile.traits],
    rank: {
      id: canonical.rankId,
      label: rankLabel(canonical.rankId),
    },
    region: profile.region,
    roles: roleIds.map((id) => ({ id, label: laneLabel(id) })),
    stats: { ...profile.stats },
    status: profileStatus(profile),
    verified: profile.verified,
    wall: profile.media.wallAssetKeys.map((key) =>
      requireMediaProjection(world, key),
    ),
  };
}

export function projectSimulationHome(
  world: SimulationWorldSnapshot,
): SimulationHomeProjection {
  const viewer = requireProfile(world, world.viewerId);
  const viewerProjection = projectSimulationProfile(world, world.viewerId);
  const matches = Object.values(world.matches)
    .filter(
      (match) =>
        match.unmatchedAt === null && match.profileIds.includes(world.viewerId),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const connections = matches.map((match) => {
    const otherId = match.profileIds.find((id) => id !== world.viewerId);
    if (!otherId) {
      throw new SimulationProjectionError(
        `Match ${match.id} has no profile other than viewer.`,
        'profile_missing',
      );
    }
    const other = requireProfile(world, otherId);
    const roles = roleLabels(other);
    const heroes = heroNames(other);
    const conversation = match.conversationId
      ? requireConversation(world, match.conversationId)
      : null;

    return {
      avatar: mediaProjection(world, other.media.avatarAssetKey),
      conversationId: match.conversationId,
      createdAt: match.createdAt,
      heroNames: heroes,
      id: match.id,
      kind: homeMatchKind(match.kind),
      meta: homeMeta(other, conversation),
      name: other.canonicalProfile.profileBasics.displayName,
      profileId: other.id,
      rankName: rankLabel(other.canonicalProfile.rankId),
      roleNames: roles,
      status: homeStatus(other),
      subtitle: [
        rankLabel(other.canonicalProfile.rankId),
        ...roles,
        regionLabel(other.region),
      ]
        .filter(Boolean)
        .join(' · '),
      unreadCount: conversation
        ? conversationUnreadCount(world, conversation, world.viewerId)
        : 0,
    } as const;
  });

  return {
    activeMatchCount: connections.length,
    connections,
    currentProfile: {
      avatar: viewerProjection.avatar,
      displayName: viewerProjection.displayName,
      handle: viewerProjection.gameHandle,
      rankName: viewerProjection.rank.label,
      readySummary:
        viewer.readiness.state === 'ready'
          ? `Đang sẵn sàng · ${readyModeLabel(viewer.readiness.mode)}`
          : connections.length
            ? `${connections.length} kết nối đang hoạt động`
            : 'Hồ sơ đã sẵn sàng',
      roleNames: viewerProjection.roles.map((role) => role.label),
    },
    preview: false,
  };
}

export function projectSimulationDiscover(
  world: SimulationWorldSnapshot,
): SimulationDiscoverProjection {
  const viewer = requireProfile(world, world.viewerId);
  const targetSet = Object.values(world.sets)
    .filter(
      (set) =>
        set.status === 'open' &&
        set.ownerId === world.viewerId &&
        set.memberIds.length < set.capacity,
    )
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt))[0];

  const players = Object.values(world.profiles)
    .filter(
      (profile) =>
        profile.id !== world.viewerId &&
        profile.discoverable &&
        !hasActiveMatch(world, world.viewerId, profile.id),
    )
    .map((profile) => projectDiscoverPlayer(world, viewer, profile, targetSet))
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore ||
        left.displayName.localeCompare(right.displayName, 'vi'),
    );

  const sets = Object.values(world.sets)
    .filter((set) => set.status !== 'closed')
    .map((set) => projectDiscoverSet(world, viewer, set))
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore ||
        right.openedAt.localeCompare(left.openedAt),
    );

  const vibes = projectDiscoverVibes(world);
  const hotHero = hottestHero(world);

  return {
    filterOptions: [
      {
        appliesTo: ['players', 'sets', 'vibes'],
        id: 'rank',
        label: 'Leo rank',
      },
      { appliesTo: ['players', 'vibes'], id: 'soulmate', label: 'Tri kỉ' },
      { appliesTo: ['sets', 'vibes'], id: 'team-rank', label: 'Team rank' },
      { appliesTo: ['players', 'sets'], id: 'mic', label: 'Có mic' },
      { appliesTo: ['players', 'sets'], id: 'non-toxic', label: 'Không toxic' },
    ],
    metrics: [
      {
        kind: 'online_players',
        label: 'Người chơi online',
        value: Object.values(world.profiles).filter(
          (profile) => profile.presence.state === 'online',
        ).length,
      },
      {
        kind: 'open_sets',
        label: 'Set đang mở',
        value: Object.values(world.sets).filter((set) => set.status === 'open')
          .length,
      },
      {
        kind: 'hot_hero',
        label: 'Tướng nổi bật',
        value: hotHero,
      },
    ],
    players,
    sets,
    vibes,
  };
}

function projectDiscoverPlayer(
  world: SimulationWorldSnapshot,
  viewer: SimulatedProfile,
  profile: SimulatedProfile,
  targetSet: SimulatedSet | undefined,
): SimulationDiscoverPlayerProjection {
  const inviteState = targetSet
    ? targetSet.memberIds.includes(profile.id)
      ? 'accepted'
      : (targetSet.invites[profile.id] ?? 'available')
    : 'unavailable';
  const score = profileCompatibility(viewer, profile);
  const reasons = matchReasons(viewer, profile);
  const primaryRole = profile.canonicalProfile.laneSelection.primary;

  return {
    avatar: profileAvatar(world, profile),
    capabilities: {
      canMessage: hasActiveMatch(world, world.viewerId, profile.id),
      canViewProfile: true,
      invite:
        inviteState === 'unavailable'
          ? { state: inviteState }
          : { state: inviteState, targetSetId: targetSet?.id },
    },
    displayName: profile.canonicalProfile.profileBasics.displayName,
    facetIds: [...profile.facets],
    matchReasons: reasons,
    matchScore: score,
    onlineStatus: profile.presence.state,
    primaryRole: { id: primaryRole, name: laneLabel(primaryRole) },
    profileId: profile.id,
    rank: {
      id: profile.canonicalProfile.rankId,
      name: rankLabel(profile.canonicalProfile.rankId),
    },
  };
}

function projectDiscoverSet(
  world: SimulationWorldSnapshot,
  viewer: SimulatedProfile,
  set: SimulatedSet,
): SimulationDiscoverSetProjection {
  const relationship =
    set.ownerId === world.viewerId
      ? 'owner'
      : set.memberIds.includes(world.viewerId)
        ? 'member'
        : 'none';
  const joinRequestStatus = set.joinRequests[world.viewerId] ?? 'none';
  const status = set.memberIds.length >= set.capacity ? 'full' : set.status;

  return {
    artwork: requireMediaProjection(world, set.artworkAssetKey),
    communication: { voicePolicy: set.voicePolicy },
    facetIds: [...set.facets],
    id: set.id,
    matchScore:
      set.compatibilityByProfile[world.viewerId] ??
      setCompatibility(viewer, set),
    members: {
      preview: set.memberIds.slice(0, 3).map((profileId) => {
        const profile = requireProfile(world, profileId);
        return { id: profile.id, media: profileAvatar(world, profile) };
      }),
      totalCount: set.memberIds.length,
    },
    mode: set.mode,
    occupancy: { capacity: set.capacity, current: set.memberIds.length },
    openedAt: set.openedAt,
    recruitment: {
      missingRoles: set.missingLaneIds.map((id) => ({
        id,
        name: laneLabel(id),
      })),
      requiresApproval: set.requiresApproval,
      requiresRoleSelection: set.requiresRoleSelection,
      status,
    },
    tags: set.tags.map((tag) => ({ ...tag })),
    title: set.title,
    version: set.version,
    viewerState: {
      canRequestJoin: relationship === 'none' && status === 'open',
      canViewDetails: true,
      joinRequestStatus,
      relationship,
    },
  };
}

function projectDiscoverVibes(
  world: SimulationWorldSnapshot,
): SimulationDiscoverVibeProjection[] {
  const online = Object.values(world.profiles).filter(
    (profile) => profile.presence.state === 'online',
  );
  const ranked = online.filter((profile) => profile.facets.includes('rank'));
  const social = Object.values(world.profiles).filter((profile) =>
    profile.facets.includes('soulmate'),
  );
  const teams = Object.values(world.sets).filter(
    (set) => set.mode === 'team_rank' && set.status === 'open',
  );
  const artwork = Object.values(world.assets)
    .filter((asset) => asset.kind === 'vibe-artwork')
    .sort((left, right) => left.key.localeCompare(right.key));
  const fallback = requireFallbackMedia(world);
  const vibeMedia = (index: number) =>
    artwork[index]
      ? requireMediaProjection(world, artwork[index].key)
      : fallback;
  const avatarPreview = (profiles: readonly SimulatedProfile[]) =>
    profiles.slice(0, 3).map((profile) => ({
      id: profile.id,
      media: profileAvatar(world, profile),
    }));

  return [
    {
      activityType: 'ranked',
      artwork: vibeMedia(0),
      engagement: { count: ranked.length, kind: 'interested_players' },
      facetIds: ['rank', 'mic'],
      id: 'vibe:rank-tonight',
      participants: {
        preview: avatarPreview(ranked),
        totalCount: ranked.length,
      },
      slug: 'rank-tonight',
      title: 'Leo rank tối nay',
    },
    {
      activityType: 'duo',
      artwork: vibeMedia(1),
      engagement: { count: social.length, kind: 'interested_players' },
      facetIds: ['soulmate', 'non-toxic'],
      id: 'vibe:long-term-duo',
      participants: {
        preview: avatarPreview(social),
        totalCount: social.length,
      },
      slug: 'long-term-duo',
      title: 'Tìm duo lâu dài',
    },
    {
      activityType: 'team_recruitment',
      artwork: vibeMedia(2),
      engagement: { count: teams.length, kind: 'teams_recruiting' },
      facetIds: ['team-rank', 'rank'],
      id: 'vibe:team-recruitment',
      participants: {
        preview: avatarPreview(
          teams.flatMap((set) =>
            set.memberIds.map((profileId) => requireProfile(world, profileId)),
          ),
        ),
        totalCount: new Set(teams.flatMap((set) => set.memberIds)).size,
      },
      slug: 'team-recruitment',
      title: 'Team đang tuyển người',
    },
  ];
}

function requireProfile(world: SimulationWorldSnapshot, id: ProfileId) {
  const profile = world.profiles[id];
  if (!profile) {
    throw new SimulationProjectionError(
      `Profile not found: ${id}.`,
      'profile_missing',
    );
  }
  return profile;
}

function requireConversation(
  world: SimulationWorldSnapshot,
  id: ConversationId,
) {
  const conversation = world.conversations[id];
  if (!conversation) {
    throw new SimulationProjectionError(
      `Conversation not found: ${id}.`,
      'conversation_missing',
    );
  }
  return conversation;
}

function mediaProjection(
  world: SimulationWorldSnapshot,
  key: AssetKey | null,
): SimulationMediaProjection | null {
  return key ? requireMediaProjection(world, key) : null;
}

function requireMediaProjection(
  world: SimulationWorldSnapshot,
  key: AssetKey,
): SimulationMediaProjection {
  const asset = world.assets[key];
  if (!asset) {
    throw new SimulationProjectionError(
      `Asset not found: ${key}.`,
      'asset_missing',
    );
  }
  return {
    altText: asset.altText,
    assetKey: asset.key,
    height: asset.height,
    kind: 'fixture',
    state: asset.state,
    width: asset.width,
  };
}

function profileAvatar(
  world: SimulationWorldSnapshot,
  profile: SimulatedProfile,
) {
  return profile.media.avatarAssetKey
    ? requireMediaProjection(world, profile.media.avatarAssetKey)
    : requireFallbackMedia(world);
}

function requireFallbackMedia(world: SimulationWorldSnapshot) {
  const fallback = Object.values(world.assets)
    .filter((asset) => asset.kind === 'shared-fallback')
    .sort((left, right) => left.key.localeCompare(right.key))[0];
  if (!fallback) {
    throw new SimulationProjectionError(
      'Simulation world has no shared fallback asset.',
      'asset_missing',
    );
  }
  return requireMediaProjection(world, fallback.key);
}

function hasActiveMatch(
  world: SimulationWorldSnapshot,
  left: ProfileId,
  right: ProfileId,
) {
  return Object.values(world.matches).some(
    (match) =>
      match.unmatchedAt === null &&
      match.profileIds.includes(left) &&
      match.profileIds.includes(right),
  );
}

function conversationUnreadCount(
  world: SimulationWorldSnapshot,
  conversation: SimulatedConversation,
  viewerId: ProfileId,
) {
  const lastRead = conversation.memberState[viewerId]?.lastReadMessageId;
  const lastReadIndex = lastRead
    ? conversation.messageIds.indexOf(lastRead)
    : -1;
  return conversation.messageIds
    .slice(lastReadIndex + 1)
    .reduce((count, id) => {
      const message = world.messages[id];
      return count + (message && message.senderId !== viewerId ? 1 : 0);
    }, 0);
}

function profileCompatibility(
  viewer: SimulatedProfile,
  candidate: SimulatedProfile,
) {
  let score = 45;
  if (
    viewer.canonicalProfile.laneSelection.primary !==
    candidate.canonicalProfile.laneSelection.primary
  ) {
    score += 12;
  }
  const rankGap = Math.abs(
    rankIndex(viewer.canonicalProfile.rankId) -
      rankIndex(candidate.canonicalProfile.rankId),
  );
  score += Math.max(0, 18 - rankGap * 3);
  score += intersectionCount(viewer.facets, candidate.facets) * 5;
  score += intersectionCount(viewer.traits, candidate.traits) * 3;
  if (candidate.presence.state === 'online') score += 5;
  return clampScore(score);
}

function setCompatibility(viewer: SimulatedProfile, set: SimulatedSet) {
  let score = 50;
  if (
    set.missingLaneIds.includes(viewer.canonicalProfile.laneSelection.primary)
  ) {
    score += 22;
  }
  score += intersectionCount(viewer.facets, set.facets) * 6;
  if (set.voicePolicy !== 'required') score += 4;
  return clampScore(score);
}

function matchReasons(viewer: SimulatedProfile, candidate: SimulatedProfile) {
  const reasons: Array<{ code: string; label: string }> = [];
  if (
    viewer.canonicalProfile.laneSelection.primary !==
    candidate.canonicalProfile.laneSelection.primary
  ) {
    reasons.push({ code: 'complementary_lane', label: 'Vai trò bổ trợ' });
  }
  if (intersectionCount(viewer.facets, candidate.facets) > 0) {
    reasons.push({ code: 'shared_intent', label: 'Cùng mục tiêu chơi' });
  }
  if (candidate.facets.includes('non-toxic')) {
    reasons.push({ code: 'positive_reputation', label: 'Không toxic' });
  }
  return reasons.slice(0, 3);
}

function hottestHero(world: SimulationWorldSnapshot) {
  const counts = new Map<HeroId, number>();
  for (const profile of Object.values(world.profiles)) {
    for (const hero of profile.canonicalProfile.favoriteHeroes) {
      counts.set(hero.heroId, (counts.get(hero.heroId) ?? 0) + 1);
    }
  }
  const hottest = [...counts.entries()].sort(
    ([leftId, leftCount], [rightId, rightCount]) =>
      rightCount - leftCount || leftId.localeCompare(rightId),
  )[0]?.[0];
  return hottest
    ? (heroDefinitionById(hottest)?.name ?? hottest)
    : (HERO_DOMAIN_CATALOG[0]?.name ?? 'Chưa có');
}

function homeMeta(
  profile: SimulatedProfile,
  conversation: SimulatedConversation | null,
) {
  const time = profile.canonicalProfile.habits.timePreferenceIds[0];
  const communication =
    profile.canonicalProfile.habits.communicationPreferenceIds[0];
  if (time && communication) {
    return `${timeLabel(time)} · ${communicationLabel(communication)}`;
  }
  return conversation ? 'Đã có hội thoại' : 'Đã kết nối với bạn';
}

function profileStatus(profile: SimulatedProfile) {
  if (profile.readiness.state === 'ready') {
    return { label: 'Sẵn sàng vào set', value: 'ready' as const };
  }
  if (profile.presence.state === 'offline') {
    return { label: 'Ngoại tuyến', value: 'offline' as const };
  }
  if (profile.presence.state === 'online') {
    return { label: 'Bạn bè online', value: 'friends' as const };
  }
  return { label: 'Đang bận', value: 'busy' as const };
}

function homeStatus(profile: SimulatedProfile) {
  if (profile.readiness.state === 'ready') return 'ready' as const;
  if (profile.presence.state === 'online') return 'online' as const;
  if (profile.presence.state === 'offline') return 'offline' as const;
  return 'idle' as const;
}

function homeMatchKind(kind: SimulatedMatchKind) {
  const labels: Record<
    SimulatedMatchKind,
    SimulationHomeProjection['connections'][number]['kind']
  > = {
    normal: 'Normal',
    rank: 'Rank',
    'set-love': 'Set Love',
    soulmate: 'Tri kỉ',
    'team-rank': 'Team Rank',
  };
  return labels[kind];
}

function roleLabels(profile: SimulatedProfile) {
  return [
    profile.canonicalProfile.laneSelection.primary,
    profile.canonicalProfile.laneSelection.secondary,
  ]
    .filter((id): id is LaneSlug => Boolean(id))
    .map(laneLabel);
}

function heroNames(profile: SimulatedProfile) {
  return profile.canonicalProfile.favoriteHeroes.map(
    ({ heroId }) => heroDefinitionById(heroId)?.name ?? heroId,
  );
}

function laneLabel(id: LaneSlug) {
  return catalogOptionById(LANE_CATALOG, id)?.label ?? id;
}

function rankLabel(id: RankId) {
  return catalogOptionById(RANK_CATALOG, id)?.label ?? id;
}

function rankIndex(id: RankId) {
  return Math.max(
    0,
    RANK_CATALOG.findIndex((rank) => rank.id === id),
  );
}

function regionLabel(region: string) {
  return region === 'global' ? 'Global' : region;
}

function readyModeLabel(mode: SimulatedProfile['readiness']['mode']) {
  if (!mode) return 'Chưa chọn mood';
  return {
    normal: 'Thường',
    rank: 'Xếp hạng',
    'set-love': 'Set Love',
    soulmate: 'Tri kỉ',
    'team-rank': 'Đội xếp hạng',
  }[mode];
}

function timeLabel(value: string) {
  const labels: Record<string, string> = {
    'time.afternoon': 'Chiều',
    'time.evening': 'Tối',
    'time.late-night': 'Khuya',
    'time.midday': 'Trưa',
    'time.morning': 'Sáng',
  };
  return labels[value] ?? value;
}

function communicationLabel(value: string) {
  if (value.includes('voice')) return 'Có voice';
  if (value === 'communication.text-ping') return 'Chat là chính';
  return 'Giao tiếp linh hoạt';
}

function intersectionCount(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right);
  return left.reduce((count, item) => count + (rightSet.has(item) ? 1 : 0), 0);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
