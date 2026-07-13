import { offsetSimulationTimestamp } from '@/shared/simulation';

import type {
  CompletedHabitAnswers,
  GenderId,
  HeroId,
  LaneSlug,
  MatchIntent,
  RankId,
} from '@/entities/player-profile';

import {
  assetKey,
  conversationId,
  matchId,
  messageId,
  notificationId,
  profileId,
  scenarioId,
  setId,
  type AssetKey,
  type ConversationId,
  type MessageId,
  type ProfileId,
  type ScenarioId,
  type SetId,
} from './identity';
import {
  SimulationWorldSnapshotSchema,
  type SimulatedAssetManifestEntry,
  type SimulatedConversation,
  type SimulatedMessage,
  type SimulatedNotification,
  type SimulatedProfile,
  type SimulatedSet,
  type SimulationWorldSnapshot,
} from './world-schema';
import { assertSimulationWorldIntegrity } from './validator';

export const GOLDEN_WORLD_CLOCK = '2026-07-13T02:00:00.000Z';

export const GOLDEN_PROFILE_IDS = {
  anMage: profileId('profile:an-mage'),
  ducFlex: profileId('profile:duc-flex'),
  huyCaptain: profileId('profile:huy-captain'),
  khoaJungle: profileId('profile:khoa-jungle'),
  linhMid: profileId('profile:linh-mid'),
  maiSupport: profileId('profile:mai-support'),
  minhAnh: profileId('profile:minh-anh'),
  namSlayer: profileId('profile:nam-slayer'),
  phucJungle: profileId('profile:phuc-jungle'),
  quanViewer: profileId('profile:quan-viewer'),
  trangCarry: profileId('profile:trang-carry'),
  vyCarry: profileId('profile:vy-carry'),
} as const;

export const GOLDEN_SET_IDS = {
  demViolet: setId('set:dem-violet'),
  macroLab: setId('set:macro-lab'),
  saoBang: setId('set:sao-bang'),
} as const;

export const GOLDEN_CONVERSATION_IDS = {
  demViolet: conversationId('conversation:dem-violet'),
  khoaJungle: conversationId('conversation:khoa-jungle'),
  linhMid: conversationId('conversation:linh-mid'),
  minhAnh: conversationId('conversation:minh-anh'),
  namSlayer: conversationId('conversation:nam-slayer'),
  saoBang: conversationId('conversation:sao-bang'),
  trangCarry: conversationId('conversation:trang-carry'),
  vyCarry: conversationId('conversation:vy-carry'),
} as const;

export const GOLDEN_ASSET_KEYS = {
  avatarFallback: assetKey('asset:shared:avatar-fallback'),
  buildAya: assetKey('asset:message:build-aya'),
  coverKhoa: assetKey('asset:profile:khoa-jungle:cover'),
  coverMinhAnh: assetKey('asset:profile:minh-anh:cover'),
  coverQuan: assetKey('asset:profile:quan-viewer:cover'),
  messageLobby: assetKey('asset:message:lobby-screenshot'),
  messageVictory: assetKey('asset:message:victory-photo'),
  roleSupport: assetKey('asset:shared:role-support'),
  setDemViolet: assetKey('asset:set:dem-violet:artwork'),
  setMacroLab: assetKey('asset:set:macro-lab:artwork'),
  setSaoBang: assetKey('asset:set:sao-bang:artwork'),
  vibeRank: assetKey('asset:vibe:rank:artwork'),
  vibeSocial: assetKey('asset:vibe:social:artwork'),
  vibeTeam: assetKey('asset:vibe:team:artwork'),
  wallQuanOne: assetKey('asset:profile:quan-viewer:wall:0'),
  wallQuanTwo: assetKey('asset:profile:quan-viewer:wall:1'),
} as const;

const avatarKeyByProfile: Partial<Record<ProfileId, AssetKey>> = {
  [GOLDEN_PROFILE_IDS.anMage]: assetKey('asset:profile:an-mage:avatar'),
  [GOLDEN_PROFILE_IDS.ducFlex]: assetKey('asset:profile:duc-flex:avatar'),
  [GOLDEN_PROFILE_IDS.huyCaptain]: assetKey('asset:profile:huy-captain:avatar'),
  [GOLDEN_PROFILE_IDS.khoaJungle]: assetKey('asset:profile:khoa-jungle:avatar'),
  [GOLDEN_PROFILE_IDS.linhMid]: assetKey('asset:profile:linh-mid:avatar'),
  [GOLDEN_PROFILE_IDS.minhAnh]: assetKey('asset:profile:minh-anh:avatar'),
  [GOLDEN_PROFILE_IDS.namSlayer]: assetKey('asset:profile:nam-slayer:avatar'),
  [GOLDEN_PROFILE_IDS.phucJungle]: assetKey('asset:profile:phuc-jungle:avatar'),
  [GOLDEN_PROFILE_IDS.quanViewer]: assetKey('asset:profile:quan-viewer:avatar'),
  [GOLDEN_PROFILE_IDS.trangCarry]: assetKey('asset:profile:trang-carry:avatar'),
  [GOLDEN_PROFILE_IDS.vyCarry]: assetKey('asset:profile:vy-carry:avatar'),
};

type GoldenProfileInput = Readonly<{
  bio: string;
  createdMinutesAgo: number;
  displayName: string;
  facets: SimulatedProfile['facets'];
  gameHandle: string;
  genderId: GenderId;
  heroIds: readonly [HeroId, ...HeroId[]];
  id: ProfileId;
  identityKey: string;
  laneIds: readonly [LaneSlug, LaneSlug?];
  media?: {
    avatarAssetKey?: AssetKey | null;
    coverAssetKey?: AssetKey | null;
    wallAssetKeys?: readonly AssetKey[];
  };
  presence: SimulatedProfile['presence']['state'];
  rankId: RankId;
  readiness: SimulatedProfile['readiness'];
  region?: string;
  stats: SimulatedProfile['stats'];
  traits: readonly string[];
  verified?: boolean;
  habitVariant?: 'balanced' | 'competitive' | 'social' | 'quiet';
  matchIntent?: MatchIntent | null;
}>;

export function createGoldenWorldSnapshot(
  worldScenarioId: ScenarioId = scenarioId('scenario:viewer-ready-happy-path'),
): SimulationWorldSnapshot {
  const profiles = createProfiles();
  const sets = createSets();
  const { conversations, messages } = createConversationGraph();
  const matches = createMatches();
  const notifications = createNotifications(messages);
  const assets = createAssetManifest(messages);

  return assertSimulationWorldIntegrity(
    SimulationWorldSnapshotSchema.parse({
      assets,
      conversations,
      generatedAt: GOLDEN_WORLD_CLOCK,
      matches,
      messages,
      notifications,
      profiles,
      scenarioId: worldScenarioId,
      sets,
      version: 1,
      viewerId: GOLDEN_PROFILE_IDS.quanViewer,
    }),
  );
}

export const GOLDEN_WORLD = createGoldenWorldSnapshot();

export type GoldenAssetRequirements = Readonly<{
  messages: Record<MessageId, readonly AssetKey[]>;
  profiles: Record<
    ProfileId,
    Readonly<{
      avatar: AssetKey | null;
      cover: AssetKey | null;
      pending: readonly AssetKey[];
      wall: readonly AssetKey[];
    }>
  >;
  sets: Record<SetId, Readonly<{ artwork: AssetKey }>>;
}>;

/** Canonical entity-to-asset requirements consumed by the asset platform. */
export const GOLDEN_ASSET_REQUIREMENTS: GoldenAssetRequirements = {
  messages: Object.fromEntries(
    Object.values(GOLDEN_WORLD.messages).map((message) => [
      message.id,
      messageAssetKeys(message),
    ]),
  ) as Record<MessageId, readonly AssetKey[]>,
  profiles: Object.fromEntries(
    Object.values(GOLDEN_WORLD.profiles).map((profile) => [
      profile.id,
      {
        avatar: profile.media.avatarAssetKey,
        cover: profile.media.coverAssetKey,
        pending: profile.media.pendingAssociations.map((item) => item.assetKey),
        wall: [...profile.media.wallAssetKeys],
      },
    ]),
  ) as GoldenAssetRequirements['profiles'],
  sets: Object.fromEntries(
    Object.values(GOLDEN_WORLD.sets).map((set) => [
      set.id,
      { artwork: set.artworkAssetKey },
    ]),
  ) as GoldenAssetRequirements['sets'],
};

function createProfiles(): Record<ProfileId, SimulatedProfile> {
  const profiles = [
    createProfile({
      bio: 'Flex rank, ưu tiên giao tiếp rõ ràng và không toxic.',
      createdMinutesAgo: 60 * 24 * 90,
      displayName: 'Quân',
      facets: ['rank', 'mic', 'non-toxic'],
      gameHandle: 'QuanFlex',
      genderId: 'male',
      heroIds: ['heino', 'edras', 'aya'],
      id: GOLDEN_PROFILE_IDS.quanViewer,
      identityKey: 'golden.actor.viewer.quan',
      laneIds: ['mid', 'support'],
      media: {
        avatarAssetKey: avatarKeyByProfile[GOLDEN_PROFILE_IDS.quanViewer],
        coverAssetKey: GOLDEN_ASSET_KEYS.coverQuan,
        wallAssetKeys: [
          GOLDEN_ASSET_KEYS.wallQuanOne,
          GOLDEN_ASSET_KEYS.wallQuanTwo,
        ],
      },
      presence: 'online',
      rankId: 'master',
      readiness: {
        mode: 'rank',
        since: at(8),
        state: 'ready',
      },
      stats: { matches: 184, rating: 4.8, reputation: 97, winRate: 61 },
      traits: ['shot-call vừa đủ', 'ưu tiên mục tiêu', 'bình tĩnh'],
      verified: true,
      matchIntent: matchIntent('rank-climb', ['mid', 'support']),
    }),
    createProfile({
      bio: 'Support main, thích duo lâu dài và giữ không khí tích cực.',
      createdMinutesAgo: 60 * 24 * 120,
      displayName: 'Minh Anh',
      facets: ['soulmate', 'mic', 'non-toxic'],
      gameHandle: 'MinhAnhSP',
      genderId: 'female',
      heroIds: ['aya', 'dolia', 'ming'],
      id: GOLDEN_PROFILE_IDS.minhAnh,
      identityKey: 'golden.actor.minh-anh',
      laneIds: ['support', 'mid'],
      media: {
        avatarAssetKey: avatarKeyByProfile[GOLDEN_PROFILE_IDS.minhAnh],
        coverAssetKey: GOLDEN_ASSET_KEYS.coverMinhAnh,
      },
      presence: 'online',
      rankId: 'master',
      readiness: {
        mode: 'soulmate',
        since: at(14),
        state: 'ready',
      },
      stats: { matches: 231, rating: 4.9, reputation: 99, winRate: 59 },
      traits: ['support chủ động', 'voice khi cần', 'không blame'],
      verified: true,
      habitVariant: 'social',
      matchIntent: matchIntent('long-term-duo', ['support', 'mid']),
    }),
    createProfile({
      bio: 'Jungle cạnh tranh, call mục tiêu nhanh và thích leo rank.',
      createdMinutesAgo: 60 * 24 * 150,
      displayName: 'Khoa Jungle',
      facets: ['rank', 'mic'],
      gameHandle: 'KhoaJGL',
      genderId: 'male',
      heroIds: ['aoi', 'billow', 'yan'],
      id: GOLDEN_PROFILE_IDS.khoaJungle,
      identityKey: 'golden.actor.khoa-jungle',
      laneIds: ['jungle', 'slayer'],
      media: {
        avatarAssetKey: avatarKeyByProfile[GOLDEN_PROFILE_IDS.khoaJungle],
        coverAssetKey: GOLDEN_ASSET_KEYS.coverKhoa,
      },
      presence: 'online',
      rankId: 'conqueror',
      readiness: { mode: 'rank', since: at(5), state: 'ready' },
      stats: { matches: 412, rating: 4.6, reputation: 91, winRate: 64 },
      traits: ['xâm lăng sớm', 'kiểm soát rồng', 'call ngắn'],
      habitVariant: 'competitive',
      matchIntent: matchIntent('rank-climb', ['jungle', 'slayer']),
    }),
    createProfile({
      bio: 'Mid phân tích macro, thích trao đổi sau trận.',
      createdMinutesAgo: 60 * 24 * 80,
      displayName: 'Linh Mid',
      facets: ['rank', 'non-toxic'],
      gameHandle: 'LinhMacro',
      genderId: 'female',
      heroIds: ['yue', 'lorion', 'dirak'],
      id: GOLDEN_PROFILE_IDS.linhMid,
      identityKey: 'golden.actor.linh-mid',
      laneIds: ['mid', 'support'],
      presence: 'recently_online',
      rankId: 'grandmaster-ii',
      readiness: { mode: null, since: null, state: 'busy' },
      stats: { matches: 276, rating: 4.8, reputation: 96, winRate: 58 },
      traits: ['macro', 'phân tích replay', 'đánh chắc'],
    }),
    createProfile({
      bio: 'Carry vui vẻ, ưu tiên giao tranh và tương tác nhiều.',
      createdMinutesAgo: 60 * 24 * 72,
      displayName: 'Vy Carry',
      facets: ['soulmate', 'mic', 'non-toxic'],
      gameHandle: 'VyCarry',
      genderId: 'female',
      heroIds: ['teeri', 'bright', 'flowborn'],
      id: GOLDEN_PROFILE_IDS.vyCarry,
      identityKey: 'golden.actor.vy-carry',
      laneIds: ['dragon', 'mid'],
      presence: 'online',
      rankId: 'grandmaster-iii',
      readiness: { mode: 'normal', since: at(20), state: 'ready' },
      stats: { matches: 198, rating: 4.7, reputation: 94, winRate: 57 },
      traits: ['combat nhỏ', 'nói chuyện nhiều', 'không áp lực'],
      habitVariant: 'social',
      matchIntent: matchIntent('casual-play', ['dragon', 'mid']),
    }),
    createProfile({
      bio: 'Slayer điềm tĩnh, đánh chắc và cover đồng đội.',
      createdMinutesAgo: 60 * 24 * 100,
      displayName: 'Nam Slayer',
      facets: ['non-toxic'],
      gameHandle: 'NamTop',
      genderId: 'male',
      heroIds: ['qi', 'biron', 'tachi'],
      id: GOLDEN_PROFILE_IDS.namSlayer,
      identityKey: 'golden.actor.nam-slayer',
      laneIds: ['slayer', 'support'],
      presence: 'offline',
      rankId: 'grandmaster-iv',
      readiness: { mode: null, since: null, state: 'offline' },
      stats: { matches: 340, rating: 4.8, reputation: 98, winRate: 56 },
      traits: ['đánh chắc', 'cover', 'ít nói'],
      habitVariant: 'quiet',
    }),
    createProfile({
      bio: 'Captain team rank, ưu tiên kỷ luật và phân vai rõ ràng.',
      createdMinutesAgo: 60 * 24 * 200,
      displayName: 'Huy Captain',
      facets: ['team-rank', 'mic', 'rank'],
      gameHandle: 'HuyCaptain',
      genderId: 'male',
      heroIds: ['ming', 'dolia', 'aya'],
      id: GOLDEN_PROFILE_IDS.huyCaptain,
      identityKey: 'golden.actor.huy-captain',
      laneIds: ['support', 'slayer'],
      presence: 'online',
      rankId: 'legendary',
      readiness: { mode: 'team-rank', since: at(18), state: 'ready' },
      stats: { matches: 622, rating: 4.7, reputation: 95, winRate: 66 },
      traits: ['captain', 'phân vai', 'review sau trận'],
      verified: true,
      habitVariant: 'competitive',
      matchIntent: matchIntent('team-rank', ['support', 'slayer']),
    }),
    createProfile({
      bio: 'Mage mới quay lại game, thích luyện tướng và học hỏi.',
      createdMinutesAgo: 60 * 24 * 10,
      displayName: 'An Mage',
      facets: ['non-toxic'],
      gameHandle: 'AnMage',
      genderId: 'hidden',
      heroIds: ['goverra', 'iggy', 'bonnie'],
      id: GOLDEN_PROFILE_IDS.anMage,
      identityKey: 'golden.actor.an-mage',
      laneIds: ['mid', 'support'],
      presence: 'recently_online',
      rankId: 'veteran',
      readiness: { mode: 'normal', since: at(45), state: 'ready' },
      stats: { matches: 42, rating: 4.5, reputation: 90, winRate: 51 },
      traits: ['học hỏi', 'luyện tướng', 'nhận góp ý'],
    }),
    createProfile({
      bio: 'Support ưu tiên text/ping; hồ sơ cố ý chưa có media.',
      createdMinutesAgo: 60 * 24 * 16,
      displayName: 'Mai Support',
      facets: ['soulmate', 'non-toxic'],
      gameHandle: 'MaiSP',
      genderId: 'female',
      heroIds: ['dolia', 'aya', 'ming'],
      id: GOLDEN_PROFILE_IDS.maiSupport,
      identityKey: 'golden.actor.mai-support',
      laneIds: ['support', 'mid'],
      media: { avatarAssetKey: null, coverAssetKey: null },
      presence: 'offline',
      rankId: 'diamond',
      readiness: { mode: null, since: null, state: 'offline' },
      stats: { matches: 88, rating: 4.9, reputation: 100, winRate: 54 },
      traits: ['text/ping', 'bình tĩnh', 'support'],
      habitVariant: 'quiet',
    }),
    createProfile({
      bio: 'Flex nhiều lane, lịch chơi thất thường và đang offline.',
      createdMinutesAgo: 60 * 24 * 64,
      displayName: 'Đức Flex',
      facets: ['rank'],
      gameHandle: 'DucFlex',
      genderId: 'male',
      heroIds: ['edras', 'heino', 'bright'],
      id: GOLDEN_PROFILE_IDS.ducFlex,
      identityKey: 'golden.actor.duc-flex',
      laneIds: ['slayer', 'mid'],
      presence: 'offline',
      rankId: 'master',
      readiness: { mode: null, since: null, state: 'offline' },
      stats: { matches: 153, rating: 4.2, reputation: 82, winRate: 52 },
      traits: ['flex', 'lịch thay đổi', 'đánh chủ động'],
    }),
    createProfile({
      bio: 'ADC online buổi tối, thích duo ổn định.',
      createdMinutesAgo: 60 * 24 * 55,
      displayName: 'Trang Carry',
      facets: ['soulmate', 'mic'],
      gameHandle: 'TrangADC',
      genderId: 'female',
      heroIds: ['erin', 'teeri', 'bright'],
      id: GOLDEN_PROFILE_IDS.trangCarry,
      identityKey: 'golden.actor.trang-carry',
      laneIds: ['dragon', 'mid'],
      presence: 'recently_online',
      rankId: 'master',
      readiness: { mode: 'soulmate', since: at(70), state: 'ready' },
      stats: { matches: 207, rating: 4.6, reputation: 92, winRate: 58 },
      traits: ['duo ổn định', 'voice', 'farm chắc'],
      habitVariant: 'social',
      matchIntent: matchIntent('long-term-duo', ['dragon', 'mid']),
    }),
    createProfile({
      bio: 'Jungle ẩn trạng thái online, tập trung kỹ năng cá nhân.',
      createdMinutesAgo: 60 * 24 * 45,
      displayName: 'Phúc Jungle',
      facets: ['rank'],
      gameHandle: 'PhucJGL',
      genderId: 'hidden',
      heroIds: ['sinestrea', 'aoi', 'billow'],
      id: GOLDEN_PROFILE_IDS.phucJungle,
      identityKey: 'golden.actor.phuc-jungle',
      laneIds: ['jungle', 'slayer'],
      presence: 'hidden',
      rankId: 'grandmaster-i',
      readiness: { mode: null, since: null, state: 'busy' },
      stats: { matches: 309, rating: 4.1, reputation: 78, winRate: 60 },
      traits: ['solo queue', 'ít giao tiếp', 'cơ chế tốt'],
      habitVariant: 'quiet',
    }),
  ];

  return Object.fromEntries(
    profiles.map((profile) => [profile.id, profile]),
  ) as Record<ProfileId, SimulatedProfile>;
}

function createProfile(input: GoldenProfileInput): SimulatedProfile {
  const avatarAssetKey =
    input.media?.avatarAssetKey === undefined
      ? (avatarKeyByProfile[input.id] ?? null)
      : input.media.avatarAssetKey;
  const coverAssetKey = input.media?.coverAssetKey ?? null;
  const wallAssetKeys = [...(input.media?.wallAssetKeys ?? [])];
  const habits = habitsFor(input.habitVariant ?? 'balanced');
  const createdAt = at(input.createdMinutesAgo);

  return {
    bio: input.bio,
    canonicalProfile: {
      favoriteHeroes: input.heroIds.map((heroId, index) => ({
        heroId,
        priority: index + 1,
      })),
      habits,
      laneSelection: {
        primary: input.laneIds[0],
        secondary: input.laneIds[1] ?? null,
      },
      localeId: 'vi-VN',
      matchIntent: input.matchIntent ?? null,
      mediaSelection: {
        avatarSelected: Boolean(avatarAssetKey),
        coverSelected: Boolean(coverAssetKey),
        wallPositions: wallAssetKeys.map((_, index) => index),
      },
      profileBasics: {
        displayName: input.displayName,
        gameHandle: input.gameHandle,
        genderId: input.genderId,
      },
      rankId: input.rankId,
      recurringAvailability: {
        slots: [
          { dayOfWeek: 1, endMinute: 23 * 60 + 30, startMinute: 19 * 60 },
          { dayOfWeek: 3, endMinute: 23 * 60 + 30, startMinute: 19 * 60 },
          { dayOfWeek: 5, endMinute: 24 * 60, startMinute: 20 * 60 },
        ],
        timezone: 'Asia/Ho_Chi_Minh',
      },
      timezone: 'Asia/Ho_Chi_Minh',
    },
    createdAt,
    discoverable: true,
    facets: [...input.facets],
    id: input.id,
    identityKey: input.identityKey,
    media: {
      avatarAssetKey,
      coverAssetKey,
      pendingAssociations: [],
      wallAssetKeys,
    },
    presence: {
      changedAt: at(Math.max(1, input.createdMinutesAgo % 180)),
      state: input.presence,
    },
    readiness: input.readiness,
    region: input.region ?? 'global',
    stats: input.stats,
    traits: [...input.traits],
    updatedAt: at(Math.max(1, input.createdMinutesAgo % 90)),
    verified: input.verified ?? false,
  };
}

function createSets(): Record<ReturnType<typeof setId>, SimulatedSet> {
  const viewer = GOLDEN_PROFILE_IDS.quanViewer;
  const sets: SimulatedSet[] = [
    {
      artworkAssetKey: GOLDEN_ASSET_KEYS.setDemViolet,
      capacity: 3,
      compatibilityByProfile: {
        [GOLDEN_PROFILE_IDS.trangCarry]: 91,
        [GOLDEN_PROFILE_IDS.vyCarry]: 88,
      },
      createdAt: at(60 * 24 * 8),
      facets: ['soulmate', 'mic', 'non-toxic'],
      id: GOLDEN_SET_IDS.demViolet,
      invites: { [GOLDEN_PROFILE_IDS.trangCarry]: 'pending' },
      joinRequests: {},
      memberIds: [viewer, GOLDEN_PROFILE_IDS.minhAnh],
      missingLaneIds: ['dragon'],
      mode: 'rank',
      openedAt: at(36),
      ownerId: viewer,
      requiresApproval: false,
      requiresRoleSelection: true,
      status: 'open',
      tags: [
        { id: 'tag:duo-lau-dai', kind: 'trait', label: 'Duo lâu dài' },
        { id: 'tag:buoi-toi', kind: 'schedule', label: 'Buổi tối' },
      ],
      title: 'Đêm Violet',
      version: 3,
      voicePolicy: 'preferred',
    },
    {
      artworkAssetKey: GOLDEN_ASSET_KEYS.setSaoBang,
      capacity: 5,
      compatibilityByProfile: {
        [viewer]: 94,
        [GOLDEN_PROFILE_IDS.maiSupport]: 86,
      },
      createdAt: at(60 * 24 * 20),
      facets: ['team-rank', 'rank', 'mic'],
      id: GOLDEN_SET_IDS.saoBang,
      invites: { [viewer]: 'pending' },
      joinRequests: {},
      memberIds: [
        GOLDEN_PROFILE_IDS.huyCaptain,
        GOLDEN_PROFILE_IDS.khoaJungle,
        GOLDEN_PROFILE_IDS.linhMid,
        GOLDEN_PROFILE_IDS.vyCarry,
      ],
      missingLaneIds: ['support'],
      mode: 'team_rank',
      openedAt: at(22),
      ownerId: GOLDEN_PROFILE_IDS.huyCaptain,
      requiresApproval: true,
      requiresRoleSelection: true,
      status: 'open',
      tags: [
        { id: 'tag:team-4-5', kind: 'other', label: 'Team 4/5' },
        { id: 'tag:thieu-support', kind: 'role', label: 'Thiếu Trợ Thủ' },
      ],
      title: 'Team Sao Băng',
      version: 7,
      voicePolicy: 'required',
    },
    {
      artworkAssetKey: GOLDEN_ASSET_KEYS.setMacroLab,
      capacity: 5,
      compatibilityByProfile: {
        [viewer]: 82,
        [GOLDEN_PROFILE_IDS.ducFlex]: 78,
      },
      createdAt: at(60 * 24 * 4),
      facets: ['rank', 'non-toxic'],
      id: GOLDEN_SET_IDS.macroLab,
      invites: {},
      joinRequests: { [viewer]: 'pending' },
      memberIds: [GOLDEN_PROFILE_IDS.namSlayer, GOLDEN_PROFILE_IDS.anMage],
      missingLaneIds: ['jungle', 'dragon', 'support'],
      mode: 'rank',
      openedAt: at(90),
      ownerId: GOLDEN_PROFILE_IDS.namSlayer,
      requiresApproval: true,
      requiresRoleSelection: false,
      status: 'open',
      tags: [
        { id: 'tag:macro', kind: 'trait', label: 'Ưu tiên macro' },
        { id: 'tag:khong-toxic', kind: 'trait', label: 'Không toxic' },
      ],
      title: 'Macro Lab',
      version: 2,
      voicePolicy: 'off',
    },
  ];

  return Object.fromEntries(sets.map((set) => [set.id, set])) as Record<
    ReturnType<typeof setId>,
    SimulatedSet
  >;
}

function createConversationGraph(): {
  conversations: Record<ConversationId, SimulatedConversation>;
  messages: Record<MessageId, SimulatedMessage>;
} {
  const viewer = GOLDEN_PROFILE_IDS.quanViewer;
  const scripts = [
    directScript(
      GOLDEN_CONVERSATION_IDS.minhAnh,
      GOLDEN_PROFILE_IDS.minhAnh,
      'minh-anh',
      [
        ['other', 'Tối nay duo vài trận không?', 180],
        ['viewer', 'Được, khoảng 9 giờ nhé.', 170],
        ['other', 'Mình support, bạn mid như cũ nha.', 160],
        ['viewer', 'Chốt, ưu tiên mục tiêu lớn.', 150],
        ['other', 'Mình vừa cập nhật set Đêm Violet rồi.', 35],
        ['other', 'Vào set khi online nhé ✨', 12],
      ],
    ),
    directScript(
      GOLDEN_CONVERSATION_IDS.khoaJungle,
      GOLDEN_PROFILE_IDS.khoaJungle,
      'khoa-jungle',
      [
        ['viewer', 'Tối leo rank không?', 210],
        ['other', 'Có, đang thiếu Mid.', 200],
        ['viewer', 'Mình vào được sau 8:30.', 190],
        ['other', 'Ok, mình giữ jungle.', 42],
        ['other', 'Đang thiếu Mid, vào không?', 6],
      ],
    ),
    directScript(
      GOLDEN_CONVERSATION_IDS.linhMid,
      GOLDEN_PROFILE_IDS.linhMid,
      'linh-mid',
      [
        ['other', 'Replay hôm qua macro ổn hơn rồi.', 300],
        ['viewer', 'Đoạn phút 12 mình rotate hơi chậm.', 290],
        ['other', 'Ừ, nhưng call mục tiêu rất rõ.', 280],
        ['viewer', 'Tối xem lại thêm một game nhé.', 75],
        ['other', 'Ok, gửi mình timestamp.', 70],
      ],
    ),
    directScript(
      GOLDEN_CONVERSATION_IDS.vyCarry,
      GOLDEN_PROFILE_IDS.vyCarry,
      'vy-carry',
      [
        ['other', 'Có clip combat cuối nè.', 260],
        ['viewer', 'Gửi mình xem với.', 250],
        ['other', 'Đoạn đó support cover đẹp lắm.', 240],
        ['viewer', 'Tối làm thêm set casual nhé.', 110],
        ['other', 'Deal 😄', 105],
      ],
    ),
    directScript(
      GOLDEN_CONVERSATION_IDS.namSlayer,
      GOLDEN_PROFILE_IDS.namSlayer,
      'nam-slayer',
      [
        ['viewer', 'Macro Lab còn slot không?', 500],
        ['other', 'Còn, ưu tiên người đánh chắc.', 490],
        ['viewer', 'Mình gửi request rồi.', 480],
        ['other', 'Mình xem tối nay nhé.', 470],
      ],
    ),
    directScript(
      GOLDEN_CONVERSATION_IDS.trangCarry,
      GOLDEN_PROFILE_IDS.trangCarry,
      'trang-carry',
      [
        ['other', 'Bạn thường online mấy giờ?', 420],
        ['viewer', 'Khoảng 8 đến 11 giờ tối.', 410],
        ['other', 'Khớp lịch mình đó.', 400],
        ['viewer', 'Mình mời vào Đêm Violet nhé.', 390],
      ],
    ),
    groupScript(
      GOLDEN_CONVERSATION_IDS.saoBang,
      GOLDEN_SET_IDS.saoBang,
      [
        GOLDEN_PROFILE_IDS.huyCaptain,
        GOLDEN_PROFILE_IDS.khoaJungle,
        GOLDEN_PROFILE_IDS.linhMid,
        GOLDEN_PROFILE_IDS.vyCarry,
      ],
      'Team Sao Băng',
      'sao-bang',
      [
        [GOLDEN_PROFILE_IDS.huyCaptain, 'Tối nay scrim lúc 21:00.', 360],
        [GOLDEN_PROFILE_IDS.khoaJungle, 'Mình có mặt.', 350],
        [GOLDEN_PROFILE_IDS.linhMid, 'Mid ok.', 340],
        [GOLDEN_PROFILE_IDS.vyCarry, 'Carry ready.', 330],
        [GOLDEN_PROFILE_IDS.huyCaptain, 'Còn thiếu support.', 80],
        [GOLDEN_PROFILE_IDS.khoaJungle, 'Đã mời Quân rồi.', 24],
      ],
    ),
    groupScript(
      GOLDEN_CONVERSATION_IDS.demViolet,
      GOLDEN_SET_IDS.demViolet,
      [viewer, GOLDEN_PROFILE_IDS.minhAnh],
      'Đêm Violet',
      'dem-violet',
      [
        [viewer, 'Set này ưu tiên duo rank ổn định.', 320],
        [GOLDEN_PROFILE_IDS.minhAnh, 'Mình thêm tag voice khi cần nhé.', 310],
        [viewer, 'Ok, slot còn lại tìm carry.', 300],
        [GOLDEN_PROFILE_IDS.minhAnh, 'Trang có lịch khá khớp.', 65],
        [viewer, 'Mình đã gửi invite.', 60],
      ],
    ),
  ];

  const allMessages = scripts.flatMap((script) => script.messages);
  const messages = Object.fromEntries(
    allMessages.map((message) => [message.id, message]),
  ) as Record<MessageId, SimulatedMessage>;
  const conversations = Object.fromEntries(
    scripts.map((script) => [
      script.conversation.id,
      {
        ...script.conversation,
        messageIds: script.messages.map((message) => message.id),
      },
    ]),
  ) as Record<ConversationId, SimulatedConversation>;

  // Replace three text records with richer message kinds while preserving IDs/order.
  const vyMediaId = messageId('message:vy-carry:1');
  messages[vyMediaId] = {
    altText: 'Ảnh combat cuối trận của Vy Carry',
    assetKey: GOLDEN_ASSET_KEYS.messageVictory,
    caption: 'Combat cuối nè',
    conversationId: GOLDEN_CONVERSATION_IDS.vyCarry,
    createdAt: at(260),
    deliveryStatus: 'read',
    fileName: 'combat-cuoi.webp',
    fileSize: 384_000,
    id: vyMediaId,
    kind: 'media',
    mediaType: 'image',
    senderId: GOLDEN_PROFILE_IDS.vyCarry,
  };
  const minhBuildId = messageId('message:minh-anh:5');
  messages[minhBuildId] = {
    conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
    createdAt: at(35),
    deliveryStatus: 'delivered',
    heroId: 'aya',
    id: minhBuildId,
    kind: 'build_share',
    previewAssetKey: GOLDEN_ASSET_KEYS.buildAya,
    roleIconAssetKey: GOLDEN_ASSET_KEYS.roleSupport,
    senderId: GOLDEN_PROFILE_IDS.minhAnh,
    summary: 'Aya support kiểm soát và bảo kê',
    tags: ['Support', 'Giảm hồi chiêu', 'Bảo kê'],
    text: 'Build mình đang dùng cho set tối nay.',
  };
  const saoInviteId = messageId('message:sao-bang:6');
  messages[saoInviteId] = {
    conversationId: GOLDEN_CONVERSATION_IDS.saoBang,
    createdAt: at(24),
    deliveryStatus: 'delivered',
    id: saoInviteId,
    kind: 'team_invite',
    senderId: GOLDEN_PROFILE_IDS.khoaJungle,
    setId: GOLDEN_SET_IDS.saoBang,
    text: 'Mời Quân vào Team Sao Băng.',
  };

  return { conversations, messages };
}

function createMatches() {
  const viewer = GOLDEN_PROFILE_IDS.quanViewer;
  const definitions = [
    [
      'minh-anh',
      GOLDEN_PROFILE_IDS.minhAnh,
      GOLDEN_CONVERSATION_IDS.minhAnh,
      'soulmate',
    ],
    [
      'khoa-jungle',
      GOLDEN_PROFILE_IDS.khoaJungle,
      GOLDEN_CONVERSATION_IDS.khoaJungle,
      'rank',
    ],
    [
      'linh-mid',
      GOLDEN_PROFILE_IDS.linhMid,
      GOLDEN_CONVERSATION_IDS.linhMid,
      'normal',
    ],
    [
      'vy-carry',
      GOLDEN_PROFILE_IDS.vyCarry,
      GOLDEN_CONVERSATION_IDS.vyCarry,
      'set-love',
    ],
    [
      'nam-slayer',
      GOLDEN_PROFILE_IDS.namSlayer,
      GOLDEN_CONVERSATION_IDS.namSlayer,
      'normal',
    ],
    [
      'trang-carry',
      GOLDEN_PROFILE_IDS.trangCarry,
      GOLDEN_CONVERSATION_IDS.trangCarry,
      'soulmate',
    ],
  ] as const;
  return Object.fromEntries(
    definitions.map(([slug, otherId, directConversationId, kind], index) => {
      const id = matchId(`match:${slug}`);
      return [
        id,
        {
          conversationId: directConversationId,
          createdAt: at(60 * 24 * (index + 1)),
          id,
          kind,
          profileIds: [viewer, otherId],
          setId: null,
          unmatchedAt: null,
        },
      ];
    }),
  );
}

function createNotifications(
  messages: Record<MessageId, SimulatedMessage>,
): Record<ReturnType<typeof notificationId>, SimulatedNotification> {
  const viewer = GOLDEN_PROFILE_IDS.quanViewer;
  const definitions: SimulatedNotification[] = [
    {
      id: notificationId('notification:sao-bang-invite'),
      kind: 'set-invite',
      occurredAt: at(22),
      payload: {
        actorId: GOLDEN_PROFILE_IDS.huyCaptain,
        setId: GOLDEN_SET_IDS.saoBang,
      },
      readAt: null,
      recipientId: viewer,
      seenAt: null,
      target: { kind: 'set', setId: GOLDEN_SET_IDS.saoBang },
    },
    {
      id: notificationId('notification:khoa-message'),
      kind: 'direct-message',
      occurredAt: at(6),
      payload: {
        actorId: GOLDEN_PROFILE_IDS.khoaJungle,
        conversationId: GOLDEN_CONVERSATION_IDS.khoaJungle,
        messageId: messageId('message:khoa-jungle:5'),
      },
      readAt: null,
      recipientId: viewer,
      seenAt: null,
      target: {
        kind: 'conversation',
        conversationId: GOLDEN_CONVERSATION_IDS.khoaJungle,
      },
    },
    {
      id: notificationId('notification:minh-anh-message'),
      kind: 'direct-message',
      occurredAt: at(12),
      payload: {
        actorId: GOLDEN_PROFILE_IDS.minhAnh,
        conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
        messageId: messageId('message:minh-anh:6'),
      },
      readAt: null,
      recipientId: viewer,
      seenAt: null,
      target: {
        kind: 'conversation',
        conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      },
    },
    {
      id: notificationId('notification:praise-team'),
      kind: 'praise-received',
      occurredAt: at(40),
      payload: {
        actorIds: [GOLDEN_PROFILE_IDS.minhAnh, GOLDEN_PROFILE_IDS.linhMid],
        count: 2,
      },
      readAt: null,
      recipientId: viewer,
      seenAt: null,
      target: { kind: 'profile', profileId: viewer },
    },
    {
      id: notificationId('notification:sao-bang-event'),
      kind: 'team-event',
      occurredAt: at(85),
      payload: {
        setId: GOLDEN_SET_IDS.saoBang,
        startsAt: '2026-07-13T14:00:00.000Z',
      },
      readAt: at(84),
      recipientId: viewer,
      seenAt: at(84),
      target: { kind: 'set', setId: GOLDEN_SET_IDS.saoBang },
    },
    {
      id: notificationId('notification:mai-liked'),
      kind: 'profile-liked',
      occurredAt: at(130),
      payload: { actorId: GOLDEN_PROFILE_IDS.maiSupport },
      readAt: at(129),
      recipientId: viewer,
      seenAt: at(129),
      target: { kind: 'profile', profileId: GOLDEN_PROFILE_IDS.maiSupport },
    },
    {
      id: notificationId('notification:trang-liked'),
      kind: 'profile-liked',
      occurredAt: at(390),
      payload: { actorId: GOLDEN_PROFILE_IDS.trangCarry },
      readAt: at(389),
      recipientId: viewer,
      seenAt: at(389),
      target: { kind: 'profile', profileId: GOLDEN_PROFILE_IDS.trangCarry },
    },
    {
      id: notificationId('notification:weekly-reward'),
      kind: 'weekly-reward',
      occurredAt: at(60 * 26),
      payload: { amount: 50, currency: 'diamond' },
      readAt: at(60 * 26 - 1),
      recipientId: viewer,
      seenAt: at(60 * 26 - 1),
      target: { kind: 'none' },
    },
    {
      id: notificationId('notification:reputation'),
      kind: 'reputation-changed',
      occurredAt: at(60 * 30),
      payload: { score: 97 },
      readAt: at(60 * 30 - 1),
      recipientId: viewer,
      seenAt: at(60 * 30 - 1),
      target: { kind: 'profile', profileId: viewer },
    },
    {
      id: notificationId('notification:dem-violet-invite-pending'),
      kind: 'set-invite',
      occurredAt: at(55),
      payload: { actorId: viewer, setId: GOLDEN_SET_IDS.demViolet },
      readAt: at(54),
      recipientId: GOLDEN_PROFILE_IDS.trangCarry,
      seenAt: at(54),
      target: { kind: 'set', setId: GOLDEN_SET_IDS.demViolet },
    },
  ];

  // Guard the cross-linked message records while constructing the golden world.
  for (const notification of definitions) {
    if (
      notification.kind === 'direct-message' &&
      !messages[notification.payload.messageId]
    ) {
      throw new Error(
        `Missing golden message ${notification.payload.messageId}.`,
      );
    }
  }

  return Object.fromEntries(
    definitions.map((notification) => [notification.id, notification]),
  ) as Record<ReturnType<typeof notificationId>, SimulatedNotification>;
}

function createAssetManifest(
  messages: Record<MessageId, SimulatedMessage>,
): Record<AssetKey, SimulatedAssetManifestEntry> {
  const entries: SimulatedAssetManifestEntry[] = [
    asset(
      GOLDEN_ASSET_KEYS.avatarFallback,
      'shared-fallback',
      'Ảnh đại diện mặc định',
      {
        id: 'shared:avatar-fallback',
        kind: 'shared',
      },
    ),
    ...Object.entries(avatarKeyByProfile).flatMap(([ownerId, key]) =>
      key
        ? [
            asset(key, 'avatar', `Ảnh đại diện ${ownerId}`, {
              id: profileId(ownerId),
              kind: 'profile',
            }),
          ]
        : [],
    ),
    asset(GOLDEN_ASSET_KEYS.coverQuan, 'cover', 'Ảnh bìa của Quân', {
      id: GOLDEN_PROFILE_IDS.quanViewer,
      kind: 'profile',
    }),
    asset(GOLDEN_ASSET_KEYS.coverMinhAnh, 'cover', 'Ảnh bìa của Minh Anh', {
      id: GOLDEN_PROFILE_IDS.minhAnh,
      kind: 'profile',
    }),
    asset(GOLDEN_ASSET_KEYS.coverKhoa, 'cover', 'Ảnh bìa của Khoa Jungle', {
      id: GOLDEN_PROFILE_IDS.khoaJungle,
      kind: 'profile',
    }),
    asset(GOLDEN_ASSET_KEYS.wallQuanOne, 'wall', 'Khoảnh khắc rank của Quân', {
      id: GOLDEN_PROFILE_IDS.quanViewer,
      kind: 'profile',
    }),
    asset(GOLDEN_ASSET_KEYS.wallQuanTwo, 'wall', 'Ảnh đội hình của Quân', {
      id: GOLDEN_PROFILE_IDS.quanViewer,
      kind: 'profile',
    }),
    asset(
      GOLDEN_ASSET_KEYS.setDemViolet,
      'set-artwork',
      'Artwork set Đêm Violet',
      {
        id: GOLDEN_SET_IDS.demViolet,
        kind: 'set',
      },
    ),
    asset(
      GOLDEN_ASSET_KEYS.setSaoBang,
      'set-artwork',
      'Artwork Team Sao Băng',
      {
        id: GOLDEN_SET_IDS.saoBang,
        kind: 'set',
      },
    ),
    asset(GOLDEN_ASSET_KEYS.setMacroLab, 'set-artwork', 'Artwork Macro Lab', {
      id: GOLDEN_SET_IDS.macroLab,
      kind: 'set',
    }),
    asset(GOLDEN_ASSET_KEYS.vibeRank, 'vibe-artwork', 'Không khí leo rank', {
      id: 'shared:vibe-rank',
      kind: 'shared',
    }),
    asset(
      GOLDEN_ASSET_KEYS.vibeSocial,
      'vibe-artwork',
      'Không khí duo xã hội',
      {
        id: 'shared:vibe-social',
        kind: 'shared',
      },
    ),
    asset(GOLDEN_ASSET_KEYS.vibeTeam, 'vibe-artwork', 'Không khí tuyển team', {
      id: 'shared:vibe-team',
      kind: 'shared',
    }),
    asset(
      GOLDEN_ASSET_KEYS.messageVictory,
      'message-image',
      'Ảnh combat cuối trận',
      {
        id: messageId('message:vy-carry:1'),
        kind: 'message',
      },
    ),
    asset(
      GOLDEN_ASSET_KEYS.messageLobby,
      'message-image',
      'Ảnh lobby chờ team',
      {
        id: 'shared:unused-message-preview',
        kind: 'shared',
      },
    ),
    asset(GOLDEN_ASSET_KEYS.buildAya, 'build-preview', 'Build Aya support', {
      id: messageId('message:minh-anh:5'),
      kind: 'message',
    }),
    asset(GOLDEN_ASSET_KEYS.roleSupport, 'role-icon', 'Biểu tượng Trợ Thủ', {
      id: 'shared:role-support',
      kind: 'shared',
    }),
  ];

  for (const entry of entries) {
    if (entry.owner.kind === 'message' && !messages[entry.owner.id]) {
      throw new Error(`Missing asset owner message ${entry.owner.id}.`);
    }
  }

  return Object.fromEntries(
    entries.map((entry) => [entry.key, entry]),
  ) as Record<AssetKey, SimulatedAssetManifestEntry>;
}

function messageAssetKeys(message: SimulatedMessage): AssetKey[] {
  if (message.kind === 'media') return [message.assetKey];
  if (message.kind === 'build_share') {
    return [message.previewAssetKey, message.roleIconAssetKey];
  }
  return [];
}

function directScript(
  id: ConversationId,
  otherId: ProfileId,
  slug: string,
  lines: readonly (readonly ['other' | 'viewer', string, number])[],
) {
  const viewer = GOLDEN_PROFILE_IDS.quanViewer;
  const messages = lines.map(([speaker, text, minutesAgo], index) => ({
    conversationId: id,
    createdAt: at(minutesAgo),
    deliveryStatus:
      minutesAgo < 20 ? ('delivered' as const) : ('read' as const),
    id: messageId(`message:${slug}:${index + 1}`),
    kind: 'text' as const,
    senderId: speaker === 'viewer' ? viewer : otherId,
    text,
  }));
  const viewerReadIndex = Math.max(0, messages.length - 2);
  return {
    conversation: {
      createdAt: messages[0]?.createdAt ?? at(600),
      id,
      kind: 'direct' as const,
      memberIds: [viewer, otherId],
      memberState: {
        [viewer]: {
          archivedAt: null,
          isMuted: false,
          isPinned: id === GOLDEN_CONVERSATION_IDS.minhAnh,
          lastReadMessageId: messages[viewerReadIndex]?.id ?? null,
        },
        [otherId]: {
          archivedAt: null,
          isMuted: false,
          isPinned: false,
          lastReadMessageId: messages.at(-1)?.id ?? null,
        },
      },
      messageIds: [],
      relationship:
        otherId === GOLDEN_PROFILE_IDS.minhAnh ||
        otherId === GOLDEN_PROFILE_IDS.trangCarry
          ? ('soulmate' as const)
          : ('friend' as const),
      setId: null,
      title: null,
      typingProfileIds: [],
    },
    messages,
  };
}

function groupScript(
  id: ConversationId,
  linkedSetId: ReturnType<typeof setId>,
  memberIds: readonly ProfileId[],
  title: string,
  slug: string,
  lines: readonly (readonly [ProfileId, string, number])[],
) {
  const messages = lines.map(([senderId, text, minutesAgo], index) => ({
    conversationId: id,
    createdAt: at(minutesAgo),
    deliveryStatus: 'delivered' as const,
    id: messageId(`message:${slug}:${index + 1}`),
    kind: 'text' as const,
    senderId,
    text,
  }));
  const memberState = Object.fromEntries(
    memberIds.map((memberId) => [
      memberId,
      {
        archivedAt: null,
        isMuted: false,
        isPinned: false,
        lastReadMessageId: messages.at(-1)?.id ?? null,
      },
    ]),
  );
  return {
    conversation: {
      createdAt: messages[0]?.createdAt ?? at(600),
      id,
      kind: 'group' as const,
      memberIds: [...memberIds],
      memberState,
      messageIds: [],
      relationship: 'team' as const,
      setId: linkedSetId,
      title,
      typingProfileIds: [],
    },
    messages,
  };
}

function habitsFor(
  variant: NonNullable<GoldenProfileInput['habitVariant']>,
): CompletedHabitAnswers {
  const shared: Pick<
    CompletedHabitAnswers,
    | 'comebackResponseId'
    | 'feedbackStyleId'
    | 'lossResponseId'
    | 'sessionLengthId'
    | 'timePreferenceIds'
  > = {
    comebackResponseId: 'comeback.team-decision',
    feedbackStyleId: 'feedback.brief',
    lossResponseId: 'loss.short-break',
    sessionLengthId: 'session.three-five',
    timePreferenceIds: ['time.evening'],
  };
  if (variant === 'competitive') {
    return {
      ...shared,
      communicationPreferenceIds: ['communication.voice-proactive'],
      decisionStyleId: 'decision.shot-call',
      seriousnessId: 'seriousness.competitive',
      strategyStyleIds: ['strategy.objectives', 'strategy.press-advantage'],
      teamAtmosphereIds: ['atmosphere.respectful'],
      teamGoalIds: ['goal.rank-climb', 'goal.stable-teamwork'],
    };
  }
  if (variant === 'social') {
    return {
      ...shared,
      communicationPreferenceIds: ['communication.voice-as-needed'],
      decisionStyleId: 'decision.discuss',
      seriousnessId: 'seriousness.balanced',
      strategyStyleIds: ['strategy.protect', 'strategy.adaptive'],
      teamAtmosphereIds: ['atmosphere.social'],
      teamGoalIds: ['goal.long-term-duo', 'goal.casual'],
    };
  }
  if (variant === 'quiet') {
    return {
      ...shared,
      communicationPreferenceIds: ['communication.text-ping'],
      decisionStyleId: 'decision.autonomous',
      seriousnessId: 'seriousness.casual',
      strategyStyleIds: ['strategy.low-risk'],
      teamAtmosphereIds: ['atmosphere.calm'],
      teamGoalIds: ['goal.casual'],
    };
  }
  return {
    ...shared,
    communicationPreferenceIds: ['communication.voice-as-needed'],
    decisionStyleId: 'decision.discuss',
    seriousnessId: 'seriousness.balanced',
    strategyStyleIds: ['strategy.objectives', 'strategy.adaptive'],
    teamAtmosphereIds: ['atmosphere.friendly'],
    teamGoalIds: ['goal.rank-climb', 'goal.stable-teamwork'],
  };
}

function matchIntent(
  kind: MatchIntent['kind'],
  lanes: readonly [LaneSlug, LaneSlug?],
): MatchIntent {
  return {
    activeFrom: at(120),
    activeUntil: '2026-07-13T16:00:00.000Z',
    communicationPreferenceIds: ['communication.voice-as-needed'],
    heroIds: [],
    kind,
    laneSelection: { primary: lanes[0], secondary: lanes[1] ?? null },
    note: '',
    teamGoalIds: kind === 'casual-play' ? ['goal.casual'] : ['goal.rank-climb'],
  };
}

function asset(
  key: AssetKey,
  kind: SimulatedAssetManifestEntry['kind'],
  altText: string,
  owner: SimulatedAssetManifestEntry['owner'],
): SimulatedAssetManifestEntry {
  return {
    altText,
    height: 1024,
    key,
    kind,
    mimeType: 'image/webp',
    owner,
    state: 'available',
    width: 1024,
  };
}

function at(minutesAgo: number) {
  return offsetSimulationTimestamp(GOLDEN_WORLD_CLOCK, -minutesAgo * 60_000);
}
