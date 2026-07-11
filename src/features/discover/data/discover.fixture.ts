import type {
  DiscoverFilterOption,
  DiscoverMetric,
  DiscoverPlayerRecommendation,
  DiscoverSet,
  DiscoverVibe,
} from '../contracts/discover-contracts';

const media = (assetKey: string, altText: string) => ({
  altText,
  assetKey,
  kind: 'fixture' as const,
});
const avatar = (id: string, assetKey: string) => ({
  id,
  media: media(assetKey, id),
});

const avatars = {
  cozy: avatar('cozy-gamer', 'avatar-cozy-gamer'),
  cyber: avatar('cyber-girl', 'avatar-cyber-girl'),
  dark: avatar('dark-fighter', 'avatar-dark-fighter'),
  ice: avatar('ice-prince', 'avatar-ice-prince'),
  khoa: avatar('khoa-jungle', 'avatar-khoa-jungle'),
  lavender: avatar('lavender-mage', 'avatar-lavender-mage'),
  minhAnh: avatar('minh-anh', 'avatar-minh-anh'),
  pinkCarry: avatar('pink-carry', 'avatar-pink-carry'),
  pinkSupport: avatar('pink-support', 'avatar-pink-support'),
  silver: avatar('silver-assassin', 'avatar-silver-assassin'),
} as const;

export const discoverFixtureGeneratedAt = '2026-07-11T08:00:00.000Z';

export const discoverFilterOptionsFixture: readonly DiscoverFilterOption[] = [
  { appliesTo: ['players', 'sets', 'vibes'], id: 'rank', label: 'Rank' },
  { appliesTo: ['players', 'vibes'], id: 'soulmate', label: 'Tri kỉ' },
  {
    appliesTo: ['players', 'sets', 'vibes'],
    id: 'team-rank',
    label: 'Team Rank',
  },
  { appliesTo: ['players', 'sets', 'vibes'], id: 'mic', label: 'Mic on' },
  {
    appliesTo: ['players', 'sets', 'vibes'],
    id: 'non-toxic',
    label: 'Không toxic',
  },
];

export const discoverMetricsFixture: readonly DiscoverMetric[] = [
  { kind: 'open_sets', label: 'set mở', value: 12 },
  { kind: 'hot_hero', label: 'hot', value: 'Aya' },
  { kind: 'online_players', label: 'online', value: 38 },
];

export const discoverVibesFixture: readonly DiscoverVibe[] = [
  {
    activityType: 'ranked',
    artwork: media('vibe-late-night-rank', 'Leo rank đêm'),
    engagement: { count: 128, kind: 'interested_players' },
    facetIds: ['rank', 'mic'],
    id: 'late-night-rank',
    participants: {
      preview: [
        avatars.lavender,
        avatars.silver,
        avatars.pinkCarry,
        avatars.dark,
      ],
      totalCount: 27,
    },
    slug: 'late-night-rank',
    title: 'Leo rank đêm',
  },
  {
    activityType: 'duo',
    artwork: media('vibe-duo-support', 'Duo support'),
    engagement: { count: 24, kind: 'open_sets' },
    facetIds: ['soulmate', 'mic'],
    id: 'duo-support',
    participants: {
      preview: [avatars.pinkSupport, avatars.cozy, avatars.ice, avatars.cyber],
      totalCount: 12,
    },
    slug: 'duo-support',
    title: 'Duo support',
  },
  {
    activityType: 'team_recruitment',
    artwork: media('vibe-team-needs-mid', 'Team thiếu Mid'),
    engagement: { count: 16, kind: 'teams_recruiting' },
    facetIds: ['team-rank', 'mic'],
    id: 'team-needs-mid',
    participants: {
      preview: [
        avatars.pinkCarry,
        avatars.silver,
        avatars.lavender,
        avatars.cozy,
      ],
      totalCount: 16,
    },
    slug: 'team-needs-mid',
    title: 'Team thiếu Mid',
  },
  {
    activityType: 'casual',
    artwork: media('vibe-duo-support', 'Đấu thường chill'),
    engagement: { count: 86, kind: 'interested_players' },
    facetIds: ['mic', 'non-toxic'],
    id: 'casual-night-chill',
    participants: {
      preview: [
        avatars.cozy,
        avatars.pinkSupport,
        avatars.lavender,
        avatars.ice,
      ],
      totalCount: 21,
    },
    slug: 'casual-night-chill',
    title: 'Đấu thường chill',
  },
  {
    activityType: 'team_recruitment',
    artwork: media('vibe-team-needs-mid', 'Team 5 người tốc chiến'),
    engagement: { count: 42, kind: 'teams_recruiting' },
    facetIds: ['rank', 'team-rank', 'mic'],
    id: 'five-stack-sprint',
    participants: {
      preview: [avatars.cyber, avatars.dark, avatars.pinkCarry, avatars.silver],
      totalCount: 23,
    },
    slug: 'five-stack-sprint',
    title: 'Team 5 người tốc chiến',
  },
  {
    activityType: 'social',
    artwork: media('vibe-late-night-rank', 'Tri kỉ cuối tuần'),
    engagement: { count: 63, kind: 'interested_players' },
    facetIds: ['soulmate', 'non-toxic'],
    id: 'weekend-soulmate',
    participants: {
      preview: [
        avatars.pinkSupport,
        avatars.cozy,
        avatars.lavender,
        avatars.pinkCarry,
      ],
      totalCount: 18,
    },
    slug: 'weekend-soulmate',
    title: 'Tri kỉ cuối tuần',
  },
];

export const discoverSetsFixture: readonly DiscoverSet[] = [
  {
    artwork: media('set-team-sao-bang', 'Team Sao Băng'),
    communication: { voicePolicy: 'required' },
    facetIds: ['rank', 'team-rank', 'mic'],
    id: 'team-sao-bang',
    matchScore: 96,
    members: {
      preview: [avatars.cyber, avatars.lavender, avatars.ice, avatars.dark],
      totalCount: 4,
    },
    mode: 'team_rank',
    occupancy: { capacity: 5, current: 4 },
    openedAt: '2026-07-11T07:56:00.000Z',
    recruitment: {
      missingRoles: [{ id: 'mid', name: 'Mid' }],
      requiresApproval: true,
      requiresRoleSelection: true,
      status: 'open',
    },
    tags: [
      { id: 'liliana', kind: 'hero', label: 'Liliana' },
      { id: 'yue', kind: 'hero', label: 'Yue' },
      { id: 'lorion', kind: 'hero', label: 'Lorion' },
      { id: 'mid', kind: 'role', label: 'Đường Giữa' },
    ],
    title: 'Team Sao Băng',
    version: 3,
    viewerState: {
      canRequestJoin: false,
      canViewDetails: true,
      joinRequestStatus: 'none',
      relationship: 'none',
    },
  },
  {
    artwork: media('set-duo-jungle-support', 'Duo Rừng + Trợ Thủ'),
    communication: { voicePolicy: 'required' },
    facetIds: ['rank', 'mic'],
    id: 'duo-jungle-support',
    matchScore: 92,
    members: {
      preview: [
        avatars.cozy,
        avatars.pinkSupport,
        avatars.silver,
        avatars.pinkCarry,
      ],
      totalCount: 4,
    },
    mode: 'rank',
    occupancy: { capacity: 3, current: 2 },
    openedAt: '2026-07-11T07:49:00.000Z',
    recruitment: {
      missingRoles: [{ id: 'marksman', name: 'Xạ Thủ' }],
      requiresApproval: false,
      requiresRoleSelection: false,
      status: 'open',
    },
    tags: [
      { id: 'jungle', kind: 'role', label: 'Rừng' },
      { id: 'support', kind: 'role', label: 'Trợ Thủ' },
      { id: 'marksman', kind: 'role', label: 'Xạ Thủ' },
      { id: 'late-game', kind: 'trait', label: 'Late game' },
    ],
    title: 'Duo Rừng + Trợ Thủ',
    version: 2,
    viewerState: {
      canRequestJoin: true,
      canViewDetails: true,
      joinRequestStatus: 'none',
      relationship: 'none',
    },
  },
  {
    artwork: media('vibe-team-needs-mid', 'Leo rank 5v5'),
    communication: { voicePolicy: 'required' },
    facetIds: ['rank', 'mic', 'non-toxic'],
    id: 'leo-rank-5v5',
    matchScore: 89,
    members: {
      preview: [
        avatars.lavender,
        avatars.pinkCarry,
        avatars.silver,
        avatars.dark,
      ],
      totalCount: 4,
    },
    mode: 'rank',
    occupancy: { capacity: 5, current: 3 },
    openedAt: '2026-07-11T07:58:00.000Z',
    recruitment: {
      missingRoles: [{ id: 'support', name: 'Trợ Thủ' }],
      requiresApproval: false,
      requiresRoleSelection: false,
      status: 'open',
    },
    tags: [
      { id: 'aya', kind: 'hero', label: 'Aya' },
      { id: 'helen', kind: 'hero', label: 'Helen' },
      { id: 'non-toxic', kind: 'trait', label: 'Không toxic' },
      { id: 'evening', kind: 'schedule', label: 'Buổi tối' },
    ],
    title: 'Leo rank 5v5',
    version: 4,
    viewerState: {
      canRequestJoin: true,
      canViewDetails: true,
      joinRequestStatus: 'none',
      relationship: 'none',
    },
  },
  {
    artwork: media('vibe-late-night-rank', 'Team late night'),
    communication: { voicePolicy: 'preferred' },
    facetIds: ['rank', 'team-rank', 'non-toxic'],
    id: 'team-late-night',
    matchScore: 84,
    members: {
      preview: [avatars.silver, avatars.ice, avatars.cozy, avatars.dark],
      totalCount: 4,
    },
    mode: 'team_rank',
    occupancy: { capacity: 5, current: 4 },
    openedAt: '2026-07-11T07:42:00.000Z',
    recruitment: {
      missingRoles: [{ id: 'jungle', name: 'Rừng' }],
      requiresApproval: true,
      requiresRoleSelection: true,
      status: 'open',
    },
    tags: [
      { id: 'nakroth', kind: 'hero', label: 'Nakroth' },
      { id: 'aoi', kind: 'hero', label: 'Aoi' },
      { id: 'late-night', kind: 'schedule', label: 'Tối muộn' },
      { id: 'non-toxic', kind: 'trait', label: 'Không toxic' },
    ],
    title: 'Team late night',
    version: 2,
    viewerState: {
      canRequestJoin: false,
      canViewDetails: true,
      joinRequestStatus: 'none',
      relationship: 'none',
    },
  },
];

export const discoverPlayersFixture: readonly DiscoverPlayerRecommendation[] = [
  {
    avatar: avatars.minhAnh.media,
    capabilities: {
      canMessage: true,
      canViewProfile: true,
      invite: { state: 'unavailable' },
    },
    displayName: 'Minh Anh',
    facetIds: ['soulmate', 'mic'],
    matchReasons: [
      { code: 'evening', label: 'Cùng chơi buổi tối' },
      { code: 'mic', label: 'Mic on' },
    ],
    matchScore: 92,
    onlineStatus: 'online',
    primaryRole: { id: 'support', name: 'Trợ Thủ' },
    profileId: 'minh-anh',
    rank: { id: 'master', name: 'Cao Thủ' },
  },
  {
    avatar: avatars.khoa.media,
    capabilities: {
      canMessage: true,
      canViewProfile: true,
      invite: { state: 'available', targetSetId: 'duo-jungle-support' },
    },
    displayName: 'Khoa Jungle',
    facetIds: ['rank', 'non-toxic'],
    matchReasons: [
      { code: 'rank', label: 'Leo rank' },
      { code: 'non-toxic', label: 'Không toxic' },
    ],
    matchScore: 89,
    onlineStatus: 'online',
    primaryRole: { id: 'jungle', name: 'Rừng' },
    profileId: 'khoa-jungle',
    rank: { id: 'veteran', name: 'Chiến Tướng' },
  },
  {
    avatar: avatars.pinkCarry.media,
    capabilities: {
      canMessage: true,
      canViewProfile: true,
      invite: { state: 'available', targetSetId: 'team-sao-bang' },
    },
    displayName: 'Lyra Mid',
    facetIds: ['rank', 'mic'],
    matchReasons: [
      { code: 'evening-rank', label: 'Leo rank buổi tối' },
      { code: 'mic', label: 'Mic on' },
    ],
    matchScore: 95,
    onlineStatus: 'online',
    primaryRole: { id: 'mid', name: 'Đường Giữa' },
    profileId: 'lyra-mid',
    rank: { id: 'master', name: 'Cao Thủ' },
  },
  {
    avatar: avatars.ice.media,
    capabilities: {
      canMessage: true,
      canViewProfile: true,
      invite: { state: 'unavailable' },
    },
    displayName: 'Nam Support',
    facetIds: ['soulmate', 'non-toxic'],
    matchReasons: [
      { code: 'calm', label: 'Điềm tĩnh' },
      { code: 'non-toxic', label: 'Không toxic' },
    ],
    matchScore: 87,
    onlineStatus: 'offline',
    primaryRole: { id: 'support', name: 'Trợ Thủ' },
    profileId: 'nam-support',
    rank: { id: 'diamond', name: 'Tinh Anh' },
  },
  {
    avatar: avatars.cozy.media,
    capabilities: {
      canMessage: true,
      canViewProfile: true,
      invite: { state: 'available', targetSetId: 'leo-rank-5v5' },
    },
    displayName: 'An Nhi ADC',
    facetIds: ['mic', 'non-toxic'],
    matchReasons: [
      { code: 'weekend', label: 'Cùng chơi cuối tuần' },
      { code: 'mic', label: 'Mic on' },
    ],
    matchScore: 91,
    onlineStatus: 'online',
    primaryRole: { id: 'marksman', name: 'Xạ Thủ' },
    profileId: 'an-nhi-adc',
    rank: { id: 'master', name: 'Cao Thủ' },
  },
  {
    avatar: avatars.dark.media,
    capabilities: {
      canMessage: true,
      canViewProfile: true,
      invite: { state: 'unavailable' },
    },
    displayName: 'Huy Top',
    facetIds: ['rank', 'team-rank'],
    matchReasons: [
      { code: 'team-rank', label: 'Team Rank' },
      { code: 'proactive', label: 'Chơi chủ động' },
    ],
    matchScore: 84,
    onlineStatus: 'offline',
    primaryRole: { id: 'slayer', name: 'Caesar' },
    profileId: 'huy-top',
    rank: { id: 'veteran', name: 'Chiến Tướng' },
  },
];

export const discoverOverviewFixtureIds = {
  players: ['minh-anh', 'khoa-jungle'],
  sets: ['team-sao-bang', 'duo-jungle-support'],
  vibes: ['late-night-rank', 'duo-support', 'team-needs-mid'],
} as const;
