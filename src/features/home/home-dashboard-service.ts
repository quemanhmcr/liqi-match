import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { homePreviewProfileId } from './data/home-preview.fixture';
import { supabaseRest } from '@/shared/services/supabase-rest';

type MaybeArray<T> = T | T[] | null | undefined;

type RankEmbed = {
  name: string | null;
  slug: string | null;
};

type RoleEmbed = {
  name: string | null;
  slug: string | null;
};

type HeroEmbed = {
  name: string | null;
  slug: string | null;
};

type GameProfileEmbed = {
  handle: string | null;
  ranks?: MaybeArray<RankEmbed>;
  server_region: string | null;
};

type ProfileRoleEmbed = {
  roles?: MaybeArray<RoleEmbed>;
};

type ProfileHeroEmbed = {
  heroes?: MaybeArray<HeroEmbed>;
};

type ProfileHabitEmbed = {
  communication_channels: string[] | null;
  online_time_presets: string[] | null;
  seriousness: string | null;
  team_goals: string[] | null;
};

type HomeProfileRow = {
  avatar_media_id: string | null;
  display_name: string | null;
  game_profiles?: MaybeArray<GameProfileEmbed>;
  id: string;
  profile_habits?: MaybeArray<ProfileHabitEmbed>;
  profile_heroes?: ProfileHeroEmbed[] | null;
  profile_roles?: ProfileRoleEmbed[] | null;
};

type ConversationEmbed = {
  id: string;
  last_message_at: string | null;
};

type MatchRow = {
  conversations?: MaybeArray<ConversationEmbed>;
  created_at: string;
  id: string;
  profile_high?: HomeProfileRow | null;
  profile_high_id: string;
  profile_low?: HomeProfileRow | null;
  profile_low_id: string;
};

export type HomeReadyMode = {
  accent: string;
  description: string;
  id: 'setlv' | 'soulmate' | 'normal' | 'rank' | 'team';
  label: string;
};

export type CurrentHomeProfile = {
  avatarFallbackUrl?: string;
  avatarUrl?: string;
  displayName: string;
  handle?: string;
  rankName?: string;
  readySummary: string;
  roleNames: string[];
};

export type MatchedSetStatus = 'ready' | 'online' | 'idle' | 'offline';

export type MatchedSet = {
  actionLabel: string;
  avatarUrl?: string;
  conversationId?: string;
  createdAt: string;
  heroNames: string[];
  id: string;
  kind: 'Set LV' | 'Tri kỉ' | 'Normal' | 'Rank' | 'Team Rank';
  meta: string;
  name: string;
  profileId?: string;
  rankName?: string;
  roleNames: string[];
  status: MatchedSetStatus;
  statusLabel: string;
  subtitle: string;
  unreadCount?: number;
};

export type HomeDashboard = {
  activeMatchCount: number;
  currentProfile: CurrentHomeProfile;
  matchedSets: MatchedSet[];
  preview: boolean;
};

export const homeReadyModes: HomeReadyMode[] = [
  {
    accent: '#C679FF',
    description: 'Vào set nhanh với người đã match.',
    id: 'setlv',
    label: 'Set LV',
  },
  {
    accent: '#FF7AD9',
    description: 'Ưu tiên match chơi lâu dài, thân thiết.',
    id: 'soulmate',
    label: 'Tri kỉ',
  },
  {
    accent: '#64E6FF',
    description: 'Chơi vui, không áp lực rank.',
    id: 'normal',
    label: 'Normal',
  },
  {
    accent: '#5DFFB3',
    description: 'Bật mood leo rank nghiêm túc.',
    id: 'rank',
    label: 'Rank',
  },
  {
    accent: '#FFB86B',
    description: 'Lập hoặc join team rank đang thiếu vai trò.',
    id: 'team',
    label: 'Team Rank',
  },
];

const profileSelect = [
  'id',
  'display_name',
  'avatar_media_id',
  'game_profiles(handle,server_region,ranks(name,slug))',
  'profile_roles(roles(name,slug))',
  'profile_heroes(heroes(name,slug))',
  'profile_habits(seriousness,online_time_presets,team_goals,communication_channels)',
].join(',');

export async function fetchHomeDashboard(
  session: AuthSession,
): Promise<HomeDashboard> {
  const [currentProfile, matchedSets] = await Promise.all([
    fetchCurrentHomeProfile(session),
    fetchMatchedSets(session),
  ]);

  return {
    activeMatchCount: matchedSets.length,
    currentProfile,
    matchedSets,
    preview: false,
  };
}

export function buildPreviewHomeDashboard(
  session: AuthSession | null,
): HomeDashboard {
  const displayName = displayNameFromSession(session) ?? 'Bạn';
  const sessionAvatarUrl = avatarUrlFromSession(session);

  return {
    activeMatchCount: previewMatchedSets.length,
    currentProfile: {
      avatarFallbackUrl: sessionAvatarUrl,
      avatarUrl: sessionAvatarUrl,
      displayName,
      handle: displayName,
      rankName: 'Cao Thủ',
      readySummary: `${previewMatchedSets.length} set đang sẵn sàng`,
      roleNames: ['Đi Rừng', 'Trợ Thủ'],
    },
    matchedSets: previewMatchedSets,
    preview: true,
  };
}

async function fetchCurrentHomeProfile(
  session: AuthSession,
): Promise<CurrentHomeProfile> {
  const rows = await supabaseRest<HomeProfileRow[]>(
    `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=${profileSelect}&limit=1`,
    { session },
  );

  const profile = rows[0];
  const sessionAvatarUrl = avatarUrlFromSession(session);

  if (!profile) {
    const displayName = displayNameFromSession(session) ?? 'Bạn';
    return {
      avatarFallbackUrl: sessionAvatarUrl,
      avatarUrl: sessionAvatarUrl,
      displayName,
      handle: displayName,
      readySummary: 'Hồ sơ đã sẵn sàng',
      roleNames: [],
    };
  }

  const gameProfile = first(profile.game_profiles);
  const habits = first(profile.profile_habits);
  const roleNames = compact(
    profile.profile_roles?.map((item) => first(item.roles)?.name),
  );
  const timePreset = habits?.online_time_presets?.[0];

  return {
    avatarFallbackUrl: sessionAvatarUrl,
    avatarUrl: mediaUrl(profile.avatar_media_id) ?? sessionAvatarUrl,
    displayName:
      profile.display_name ?? displayNameFromSession(session) ?? 'Bạn',
    handle: gameProfile?.handle ?? undefined,
    rankName: first(gameProfile?.ranks)?.name ?? undefined,
    readySummary: timePreset
      ? `Thường online ${timePreset}`
      : 'Hồ sơ đã sẵn sàng',
    roleNames,
  };
}

async function fetchMatchedSets(session: AuthSession): Promise<MatchedSet[]> {
  const userId = encodeURIComponent(session.user.id);
  const matchSelect = [
    'id',
    'created_at',
    'profile_low_id',
    'profile_high_id',
    'conversations(id,last_message_at)',
    `profile_low:profiles!matches_profile_low_id_fkey(${profileSelect})`,
    `profile_high:profiles!matches_profile_high_id_fkey(${profileSelect})`,
  ].join(',');

  const rows = await supabaseRest<MatchRow[]>(
    `matches?or=(profile_low_id.eq.${userId},profile_high_id.eq.${userId})&unmatched_at=is.null&select=${matchSelect}&order=created_at.desc&limit=20`,
    { session },
  );

  return rows
    .map((row, index) => mapMatchRow(row, session.user.id, index))
    .filter((item): item is MatchedSet => Boolean(item));
}

function mapMatchRow(
  row: MatchRow,
  currentUserId: string,
  index: number,
): MatchedSet | null {
  const otherProfile =
    row.profile_low_id === currentUserId ? row.profile_high : row.profile_low;
  if (!otherProfile) return null;

  const gameProfile = first(otherProfile.game_profiles);
  const habits = first(otherProfile.profile_habits);
  const roleNames = compact(
    otherProfile.profile_roles?.map((item) => first(item.roles)?.name),
  );
  const heroNames = compact(
    otherProfile.profile_heroes?.map((item) => first(item.heroes)?.name),
  );
  const conversation = first(row.conversations);
  const kind = resolveMatchedKind(habits, index);

  return {
    actionLabel: kind === 'Team Rank' ? 'Join lobby' : 'Vào set',
    avatarUrl: mediaUrl(otherProfile.avatar_media_id),
    conversationId: conversation?.id,
    createdAt: row.created_at,
    heroNames,
    id: row.id,
    kind,
    meta: buildMatchedMeta(habits, conversation?.last_message_at),
    name: otherProfile.display_name ?? gameProfile?.handle ?? 'Đồng đội',
    profileId: otherProfile.id,
    rankName: first(gameProfile?.ranks)?.name ?? undefined,
    roleNames,
    status: index === 0 ? 'ready' : index % 3 === 0 ? 'idle' : 'online',
    statusLabel:
      index === 0 ? 'Sẵn sàng' : index % 3 === 0 ? 'Chờ phản hồi' : 'Online',
    subtitle: buildSubtitle({
      gameProfile,
      rankName: first(gameProfile?.ranks)?.name,
      roleNames,
    }),
    unreadCount: index === 1 ? 2 : undefined,
  };
}

function resolveMatchedKind(
  habits: ProfileHabitEmbed | undefined,
  index: number,
): MatchedSet['kind'] {
  const goals = habits?.team_goals?.join(' ').toLowerCase() ?? '';
  const seriousness = habits?.seriousness?.toLowerCase() ?? '';

  if (goals.includes('rank') || seriousness.includes('nghiêm túc'))
    return 'Rank';
  if (goals.includes('ổn định') || goals.includes('lâu')) return 'Tri kỉ';
  if (index % 5 === 4) return 'Team Rank';
  if (index % 2 === 0) return 'Set LV';
  return 'Normal';
}

function buildSubtitle(input: {
  gameProfile: GameProfileEmbed | undefined;
  rankName: string | null | undefined;
  roleNames: string[];
}) {
  return compact([
    input.rankName,
    input.roleNames.slice(0, 2).join(' / ') || undefined,
    input.gameProfile?.server_region === 'global'
      ? 'Global'
      : input.gameProfile?.server_region,
  ]).join(' · ');
}

function buildMatchedMeta(
  habits: ProfileHabitEmbed | undefined,
  lastMessageAt: string | null | undefined,
) {
  const timePreset = habits?.online_time_presets?.[0];
  const channel = habits?.communication_channels?.[0];
  if (timePreset && channel) return `${timePreset} · ${channel}`;
  if (timePreset) return `Thường online ${timePreset}`;
  if (lastMessageAt) return 'Đã có hội thoại';
  return 'Đã match thành công';
}

function displayNameFromSession(session: AuthSession | null) {
  const metadata = session?.user.user_metadata;
  const fullName = metadata?.full_name;
  const name = metadata?.name;
  const preferred = typeof fullName === 'string' ? fullName : name;
  if (typeof preferred === 'string' && preferred.trim())
    return preferred.trim();
  return session?.user.email?.split('@')[0];
}

function avatarUrlFromSession(session: AuthSession | null) {
  const metadata = session?.user.user_metadata;
  const candidates = [
    metadata?.avatar_url,
    metadata?.picture,
    metadata?.picture_url,
  ];
  return candidates.find(
    (value): value is string =>
      typeof value === 'string' && Boolean(value.trim()),
  );
}

function mediaUrl(assetId: string | null | undefined) {
  if (!assetId) return undefined;
  try {
    return new URL(
      `media/${encodeURIComponent(assetId)}`,
      ensureTrailingSlash(env.EXPO_PUBLIC_MEDIA_BASE_URL),
    ).toString();
  } catch {
    return undefined;
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function first<T>(value: MaybeArray<T>) {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function compact<T>(values: (T | null | undefined)[] | null | undefined) {
  return values?.filter((value): value is T => value != null) ?? [];
}

const previewMatchedSets: MatchedSet[] = [
  {
    actionLabel: 'Vào set',
    createdAt: new Date().toISOString(),
    heroNames: ['Aya', 'Helen', 'Annette'],
    id: 'preview-1',
    kind: 'Tri kỉ',
    meta: 'Tối · Voice khi cần',
    name: 'Minh Anh',
    profileId: homePreviewProfileId,
    rankName: 'Cao Thủ',
    roleNames: ['Trợ Thủ'],
    status: 'ready',
    statusLabel: 'Sẵn sàng',
    subtitle: 'Cao Thủ · Trợ Thủ · Global',
    unreadCount: 1,
  },
  {
    actionLabel: 'Vào set',
    createdAt: new Date().toISOString(),
    heroNames: ['Nakroth', 'Aoi', 'Keera'],
    id: 'preview-2',
    kind: 'Rank',
    meta: 'Leo rank nghiêm túc · Ping/chat là chính',
    name: 'Khoa Jungle',
    rankName: 'Chiến Tướng',
    roleNames: ['Đi Rừng'],
    status: 'online',
    statusLabel: 'Online',
    subtitle: 'Chiến Tướng · Đi Rừng · Global',
  },
  {
    actionLabel: 'Join lobby',
    createdAt: new Date().toISOString(),
    heroNames: ['Liliana', 'Yue', 'Lorion'],
    id: 'preview-3',
    kind: 'Team Rank',
    meta: 'Team 4/5 · thiếu Mid call map',
    name: 'Team Sao Băng',
    rankName: 'Đại Cao Thủ',
    roleNames: ['Đường Giữa'],
    status: 'idle',
    statusLabel: 'Chờ phản hồi',
    subtitle: 'Đại Cao Thủ · Team Rank · cần Mid',
  },
];
