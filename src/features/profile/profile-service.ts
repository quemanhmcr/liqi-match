import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  profileMockHeroes,
  profileMockMinhAnhUserId,
  profileMockPlayStyleTags,
  profileMockQuote,
} from './profile.mock';

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

type ProfileRow = {
  avatar_media_id: string | null;
  bio: string | null;
  display_name: string | null;
  game_profiles?: MaybeArray<GameProfileEmbed>;
  id: string;
  profile_habits?: MaybeArray<ProfileHabitEmbed>;
  profile_heroes?: ProfileHeroEmbed[] | null;
  profile_roles?: ProfileRoleEmbed[] | null;
};

export type ProfileFavoriteHero = {
  matches: number;
  name: string;
  slug?: string;
  winRate: number;
};

export type ProfileViewModel = {
  avatarFallbackUrl?: string;
  avatarUrl?: string;
  bio: string;
  coverUrl?: string;
  displayName: string;
  favoriteHeroes: ProfileFavoriteHero[];
  id: string;
  playStyleTags: string[];
  rankName?: string;
  region?: string;
  roleNames: string[];
  verified: boolean;
};

const profileSelect = [
  'id',
  'display_name',
  'bio',
  'avatar_media_id',
  'game_profiles(handle,server_region,ranks(name,slug))',
  'profile_roles(roles(name,slug))',
  'profile_heroes(heroes(name,slug))',
  'profile_habits(seriousness,online_time_presets,team_goals,communication_channels)',
].join(',');

export async function fetchProfileView(input: {
  session: AuthSession;
  userId?: string;
}): Promise<ProfileViewModel> {
  const targetUserId = input.userId ?? input.session.user.id;
  if (isMinhAnhMockProfile(targetUserId)) {
    return buildMinhAnhPreviewProfile();
  }

  const rows = await supabaseRest<ProfileRow[]>(
    `profiles?id=eq.${encodeURIComponent(targetUserId)}&select=${profileSelect}&limit=1`,
    { session: input.session },
  );

  const row = rows[0];
  if (!row) {
    return buildPreviewProfile(input.session, targetUserId);
  }

  const gameProfile = first(row.game_profiles);
  const habits = first(row.profile_habits);
  const roleNames = compact(
    row.profile_roles?.map((item) => first(item.roles)?.name),
  );
  const heroEmbeds = compact(
    row.profile_heroes?.map((item) => first(item.heroes)),
  );
  const avatarFallbackUrl =
    targetUserId === input.session.user.id
      ? avatarUrlFromSession(input.session)
      : undefined;
  const avatarUrl = mediaUrl(row.avatar_media_id) ?? avatarFallbackUrl;
  return {
    avatarFallbackUrl,
    avatarUrl,
    bio: row.bio?.trim() || profileMockQuote,
    displayName:
      row.display_name ?? gameProfile?.handle ?? displayNameFromSession(input.session) ?? 'Liqi Player',
    favoriteHeroes: buildFavoriteHeroes(heroEmbeds),
    id: row.id,
    playStyleTags: buildPlayStyleTags(habits),
    rankName: first(gameProfile?.ranks)?.name ?? undefined,
    region: formatRegion(gameProfile?.server_region),
    roleNames,
    verified: true,
  };
}

export function buildPreviewProfile(
  session: AuthSession | null,
  userId = 'preview-profile',
): ProfileViewModel {
  if (isMinhAnhMockProfile(userId)) {
    return buildMinhAnhPreviewProfile();
  }

  const avatarFallbackUrl = avatarUrlFromSession(session);
  return {
    avatarFallbackUrl,
    avatarUrl: avatarFallbackUrl,
    bio: profileMockQuote,
    displayName: displayNameFromSession(session) ?? 'Khoa Jungle',
    favoriteHeroes: profileMockHeroes.map((hero) => ({
      matches: hero.matches,
      name: hero.name,
      slug: hero.slug,
      winRate: hero.winRate,
    })),
    id: userId,
    playStyleTags: [...profileMockPlayStyleTags],
    rankName: 'Cao Thủ',
    region: 'Global',
    roleNames: ['Trợ Thủ'],
    verified: true,
  };
}


function buildMinhAnhPreviewProfile(): ProfileViewModel {
  return {
    bio: profileMockQuote,
    displayName: 'Minh Anh',
    favoriteHeroes: profileMockHeroes.map((hero) => ({
      matches: hero.matches,
      name: hero.name,
      slug: hero.slug,
      winRate: hero.winRate,
    })),
    id: profileMockMinhAnhUserId,
    playStyleTags: [...profileMockPlayStyleTags],
    rankName: 'Cao Thủ',
    region: 'Global',
    roleNames: ['Trợ Thủ'],
    verified: true,
  };
}

function isMinhAnhMockProfile(userId: string | undefined) {
  return userId === profileMockMinhAnhUserId;
}

function buildFavoriteHeroes(heroes: HeroEmbed[]): ProfileFavoriteHero[] {
  if (heroes.length < 3) {
    return profileMockHeroes.map((hero) => ({
      matches: hero.matches,
      name: hero.name,
      slug: hero.slug,
      winRate: hero.winRate,
    }));
  }

  return heroes.slice(0, 3).map((hero, index) => ({
    matches: [127, 104, 89][index] ?? 76,
    name: hero.name ?? profileMockHeroes[index]?.name ?? 'Tướng',
    slug: hero.slug ?? undefined,
    winRate: [64, 62, 61][index] ?? 60,
  }));
}

function buildPlayStyleTags(habits: ProfileHabitEmbed | undefined) {
  const tags = compact([
    habits?.seriousness,
    ...(habits?.communication_channels ?? []),
    ...(habits?.online_time_presets ?? []),
    ...(habits?.team_goals ?? []),
  ])
    .map(formatPlayStyleTag)
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 6);

  return tags.length ? tags : [...profileMockPlayStyleTags];
}

function formatPlayStyleTag(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();
  if (lower.includes('rank')) return 'Rank';
  if (lower.includes('voice') || lower.includes('mic')) return 'Mic on';
  if (lower.includes('tối')) return 'Buổi tối';
  if (lower.includes('team')) return 'Teamplay';
  if (lower.includes('nghiêm')) return 'Nghiêm túc';
  return normalized.length > 18 ? `${normalized.slice(0, 16)}…` : normalized;
}

function displayNameFromSession(session: AuthSession | null) {
  const metadata = session?.user.user_metadata;
  const fullName = metadata?.full_name;
  const name = metadata?.name;
  const preferred = typeof fullName === 'string' ? fullName : name;
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
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

function formatRegion(value: string | null | undefined) {
  if (!value) return undefined;
  return value === 'global' ? 'Global' : value;
}

function first<T>(value: MaybeArray<T>) {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function compact<T>(values: (T | null | undefined)[] | null | undefined) {
  return values?.filter((value): value is T => value != null) ?? [];
}
