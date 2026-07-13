import { HEROES } from '@/entities/hero';
import {
  uploadProfileMediaAsset,
  type LocalImageAsset,
} from '@/shared/services/media-upload';
import type { AssetKey } from '@/entities/media-asset';
import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  profileMockHeroes,
  profileMockMinhAnhUserId,
  profileMockPlayStyleTags,
  profileMockQuote,
  profileMockStats,
} from '../data/profile.fixture';

type MaybeArray<T> = T | T[] | null | undefined;
type MediaSummary = Record<string, unknown>;

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

type ProfileHabitEmbed = {
  communication_channels: string[] | null;
  media_summary: unknown | null;
  online_time_presets: string[] | null;
  seriousness: string | null;
  team_goals: string[] | null;
};

type ProfileEditHabitEmbed = ProfileHabitEmbed & {
  comeback_response: string | null;
  decision_style: string | null;
  feedback_style: string | null;
  loss_response: string | null;
  session_length: string | null;
  strategy_styles: string[] | null;
  team_atmospheres: string[] | null;
};

type ProfileEditGameProfileEmbed = {
  handle: string | null;
  rank_id: string | null;
  server_region: string | null;
};

type ProfileEditRoleEmbed = {
  role_id: string | null;
};

type ProfileEditRow = {
  avatar_media_id: string | null;
  bio: string | null;
  display_name: string | null;
  game_profiles?: MaybeArray<ProfileEditGameProfileEmbed>;
  id: string;
  profile_habits?: MaybeArray<ProfileEditHabitEmbed>;
  profile_roles?: ProfileEditRoleEmbed[] | null;
};

type RankRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

type RoleRow = {
  id: string;
  name: string;
  slug: string;
};

type HeroRow = {
  id: string;
  name: string;
  slug: string;
};

type ProfileCoverMediaRow = {
  id: string;
};

type ProfileHeroRow = {
  created_at?: string;
  hero_id: string;
  heroes?: MaybeArray<HeroEmbed>;
};

type ProfileRow = {
  avatar_media_id: string | null;
  bio: string | null;
  display_name: string | null;
  game_profiles?: MaybeArray<GameProfileEmbed>;
  id: string;
  profile_habits?: MaybeArray<ProfileHabitEmbed>;
  profile_roles?: ProfileRoleEmbed[] | null;
};

export type ProfileStatusValue = 'ready' | 'busy' | 'offline' | 'friends';
export type ProfileGender = 'male' | 'female' | 'hidden';

export type ProfileStats = {
  matches: number;
  rating: number;
  reputation: number;
  winRate: number;
};

export type ProfileFavoriteHero = {
  heroId?: string;
  matches?: number;
  name: string;
  slug?: string;
  winRate?: number;
};

export type ProfileHeroPickerOption = ProfileFavoriteHero & {
  role?: string;
};

export type ProfileViewModel = {
  avatarAssetKey?: AssetKey;
  avatarFallbackUrl?: string;
  avatarUrl?: string;
  bio: string;
  coverAssetKey?: AssetKey;
  coverUrl?: string;
  displayName: string;
  favoriteHeroes: ProfileFavoriteHero[];
  gender: ProfileGender;
  id: string;
  playStyleTags: string[];
  rankName?: string;
  region?: string;
  roleNames: string[];
  showWinRate: boolean;
  stats: ProfileStats;
  statusLabel: string;
  statusValue: ProfileStatusValue;
  verified: boolean;
  wallAssetKeys?: AssetKey[];
};

export type ProfileReferenceOption = {
  id: string;
  label: string;
  slug: string;
};

export type ProfileEditHabits = {
  comeback_response: string;
  communication_channels: string[];
  decision_style: string;
  feedback_style: string;
  loss_response: string;
  media_summary: unknown;
  online_time_presets: string[];
  seriousness: string;
  session_length: string;
  strategy_styles: string[];
  team_atmospheres: string[];
  team_goals: string[];
};

export type ProfileEditDraft = {
  avatarFallbackUrl?: string;
  avatarMediaId?: string | null;
  avatarUrl?: string;
  bio: string;
  coverMediaId?: string | null;
  coverUrl?: string;
  displayName: string;
  favoriteHeroes: ProfileFavoriteHero[];
  gender: ProfileGender;
  habits: ProfileEditHabits;
  heroOptions: ProfileHeroPickerOption[];
  id: string;
  ranks: ProfileReferenceOption[];
  region: string;
  roles: ProfileReferenceOption[];
  selectedRankId?: string;
  selectedRoleId?: string;
  stats: ProfileStats;
  status: ProfileStatusValue;
};

export type SaveProfileEditInput = {
  avatarMediaId?: string | null;
  bio: string;
  coverMediaId?: string | null;
  displayName: string;
  favoriteHeroes: ProfileFavoriteHero[];
  gender: ProfileGender;
  habits: ProfileEditHabits;
  rankId?: string;
  region: string;
  roleId?: string;
  stats: ProfileStats;
  status: ProfileStatusValue;
};

const profileSelect = [
  'id',
  'display_name',
  'bio',
  'avatar_media_id',
  'game_profiles(handle,server_region,ranks(name,slug))',
  'profile_roles(roles(name,slug))',
  'profile_habits(seriousness,online_time_presets,team_goals,communication_channels,media_summary)',
].join(',');

const editableRoleOrder = ['slayer', 'jungle', 'mid', 'dragon', 'support'];

const defaultProfileStats: ProfileStats = {
  matches: profileMockStats.matches,
  rating: profileMockStats.rating,
  reputation: profileMockStats.reputation,
  winRate: profileMockStats.winRate,
};

const emptyProfileStats: ProfileStats = {
  matches: 0,
  rating: 0,
  reputation: 0,
  winRate: 0,
};

const defaultEditHabits: ProfileEditHabits = {
  comeback_response: 'Vẫn cố gắng đến cuối',
  communication_channels: ['Voice khi cần'],
  decision_style: 'Cùng trao đổi trước khi quyết định',
  feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
  loss_response: 'Chơi tiếp ngay',
  media_summary: {},
  online_time_presets: ['Tối'],
  seriousness: 'Cân bằng',
  session_length: '3-5 trận',
  strategy_styles: [],
  team_atmospheres: ['Bình tĩnh, không tạo áp lực'],
  team_goals: ['Leo rank nghiêm túc', 'Tìm người phối hợp ổn định'],
};

const profileEditSelect = [
  'id',
  'display_name',
  'bio',
  'avatar_media_id',
  'game_profiles(handle,rank_id,server_region)',
  'profile_roles(role_id)',
  [
    'profile_habits(',
    'communication_channels,online_time_presets,decision_style,session_length,',
    'team_goals,seriousness,strategy_styles,team_atmospheres,feedback_style,',
    'loss_response,comeback_response,media_summary',
    ')',
  ].join(''),
].join(',');

export async function fetchProfileEditDraft(
  session: AuthSession,
): Promise<ProfileEditDraft> {
  const profileId = session.user.id;
  const [profileRows, ranks, roles, heroRows, backendHeroes] =
    await Promise.all([
      supabaseRest<ProfileEditRow[]>(
        `profiles?id=eq.${encodeURIComponent(profileId)}&select=${profileEditSelect}&limit=1`,
        { session },
      ),
      supabaseRest<RankRow[]>(
        'ranks?select=id,slug,name,sort_order&order=sort_order.asc',
        {
          session,
        },
      ),
      supabaseRest<RoleRow[]>('roles?select=id,slug,name&order=name.asc', {
        session,
      }),
      fetchProfileHeroRows(session, profileId, { allowPartialRecovery: true }),
      supabaseRest<HeroRow[]>('heroes?select=id,slug,name&order=name.asc', {
        session,
      }),
    ]);

  const row = profileRows[0];
  const preview = buildPreviewProfile(session, profileId);
  const gameProfile = first(row?.game_profiles);
  const habits = first(row?.profile_habits);
  const mediaSummary = mediaSummaryRecord(habits?.media_summary);
  const gender = profileGenderFromSummary(mediaSummary);
  const stats = profileStatsFromSummary(mediaSummary);
  const fallbackCover = await fetchUploadedProfileCover(session, profileId, {
    allowPartialRecovery: true,
  });
  const explicitCoverMediaId = mediaIdFromSummary(
    mediaSummary,
    'cover_media_id',
  );
  const coverMediaId = explicitCoverMediaId ?? fallbackCover?.id ?? null;
  const avatarMediaId = row?.avatar_media_id ?? null;
  const avatarFallbackUrl = avatarUrlFromSession(session);
  const rankOptions = ranks.map(toReferenceOption);
  const roleOptions = roles
    .filter((role) => editableRoleOrder.includes(role.slug))
    .sort(
      (left, right) =>
        editableRoleOrder.indexOf(left.slug) -
        editableRoleOrder.indexOf(right.slug),
    )
    .map(toReferenceOption);
  const favoriteHeroes = buildFavoriteHeroes(heroRows, false, mediaSummary);

  return {
    avatarFallbackUrl,
    avatarMediaId,
    avatarUrl: mediaUrl(avatarMediaId) ?? avatarFallbackUrl,
    bio: (row?.bio ?? preview.bio).slice(0, 80),
    coverMediaId,
    coverUrl: mediaUrl(coverMediaId) ?? fallbackCover?.url,
    displayName: (row?.display_name ?? preview.displayName).slice(0, 20),
    favoriteHeroes,
    gender,
    habits: buildEditHabits(habits),
    heroOptions: buildHeroOptions(backendHeroes, favoriteHeroes),
    id: row?.id ?? profileId,
    ranks: rankOptions,
    region: gameProfile?.server_region ?? 'global',
    roles: roleOptions,
    selectedRankId:
      gameProfile?.rank_id ??
      rankOptions.find((rank) => rank.slug === 'master')?.id,
    selectedRoleId:
      row?.profile_roles?.[0]?.role_id ??
      roleOptions.find((role) => role.slug === 'jungle')?.id,
    stats,
    status: statusFromSummary(mediaSummary),
  };
}

export async function saveProfileEdit(
  session: AuthSession,
  input: SaveProfileEditInput,
) {
  const profileId = session.user.id;
  const displayName = normalizeDisplayName(input.displayName);
  const bio = normalizeBio(input.bio);
  const region = normalizeRegion(input.region);
  const habits = normalizeEditHabits(input.habits);
  const mediaSummary = {
    ...mediaSummaryRecord(habits.media_summary),
    cover_media_id: input.coverMediaId ?? null,
    favorite_hero_stats: buildFavoriteHeroStatsSummary(input.favoriteHeroes),
    profile_basics: {
      ...mediaSummaryRecord(
        mediaSummaryRecord(habits.media_summary).profile_basics,
      ),
      gender: normalizeProfileGender(input.gender),
    },
    profile_stats: normalizeProfileStats(input.stats),
    profile_status: normalizeStatus(input.status),
  };

  await supabaseRest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    body: {
      avatar_media_id: input.avatarMediaId ?? null,
      bio: bio || null,
      display_name: displayName,
    },
    method: 'PATCH',
    prefer: 'return=minimal',
    session,
  });

  await supabaseRest('game_profiles?on_conflict=profile_id', {
    body: {
      handle: displayName,
      profile_id: profileId,
      rank_id: input.rankId ?? null,
      server_region: region,
    },
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    session,
  });

  if (input.roleId) {
    await supabaseRest('profile_roles?on_conflict=profile_id,role_id', {
      body: { profile_id: profileId, role_id: input.roleId },
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      session,
    });
    await supabaseRest(
      `profile_roles?profile_id=eq.${encodeURIComponent(profileId)}&role_id=neq.${encodeURIComponent(input.roleId)}`,
      { method: 'DELETE', prefer: 'return=minimal', session },
    );
  }

  await supabaseRest('profile_habits?on_conflict=profile_id', {
    body: {
      ...habits,
      media_summary: mediaSummary,
      profile_id: profileId,
    },
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    session,
  });

  await saveProfileHeroes(session, profileId, input.favoriteHeroes);
}

export async function uploadEditableProfileMedia(
  session: AuthSession,
  input: { asset: LocalImageAsset; slot: 'avatar' | 'cover' },
) {
  const uploaded = await uploadProfileMediaAsset(session, input);
  return {
    ...uploaded,
    url: mediaUrl(uploaded.assetId),
  };
}

export async function fetchProfileView(input: {
  session: AuthSession;
  userId?: string;
}): Promise<ProfileViewModel | null> {
  const targetUserId = input.userId ?? input.session.user.id;

  const rows = await supabaseRest<ProfileRow[]>(
    `profiles?id=eq.${encodeURIComponent(targetUserId)}&select=${profileSelect}&limit=1`,
    { session: input.session },
  );

  const row = rows[0];
  if (!row) return null;

  const gameProfile = first(row.game_profiles);
  const habits = first(row.profile_habits);
  const mediaSummary = mediaSummaryRecord(habits?.media_summary);
  const roleNames = compact(
    row.profile_roles?.map((item) => first(item.roles)?.name) ?? [],
  );
  const heroRows = await fetchProfileHeroRows(input.session, row.id);
  const isSelf = targetUserId === input.session.user.id;
  const avatarFallbackUrl = isSelf
    ? avatarUrlFromSession(input.session)
    : undefined;
  const displayName =
    row.display_name?.trim() ||
    gameProfile?.handle?.trim() ||
    (isSelf ? displayNameFromSession(input.session) : undefined) ||
    'Người chơi Liqi';
  const avatarUrl = mediaUrl(row.avatar_media_id) ?? avatarFallbackUrl;
  const explicitCoverMediaId = mediaIdFromSummary(
    mediaSummary,
    'cover_media_id',
  );
  const fallbackCover = explicitCoverMediaId
    ? undefined
    : await fetchUploadedProfileCover(input.session, row.id);
  const coverUrl = mediaUrl(explicitCoverMediaId) ?? fallbackCover?.url;
  const gender = profileGenderFromSummary(mediaSummary);
  const showWinRate = showWinRateFromSummary(mediaSummary);
  const stats = profileStatsFromSummary(mediaSummary, emptyProfileStats);
  const statusValue = statusFromSummary(mediaSummary);

  return {
    avatarFallbackUrl,
    avatarUrl,
    coverUrl,
    bio: row.bio?.trim() ?? '',
    displayName,
    favoriteHeroes: buildFavoriteHeroes(heroRows, false, mediaSummary),
    gender,
    id: row.id,
    playStyleTags: buildPlayStyleTags(habits),
    rankName: first(gameProfile?.ranks)?.name ?? undefined,
    region: formatRegion(gameProfile?.server_region),
    roleNames,
    showWinRate,
    stats,
    statusLabel: statusLabel(statusValue),
    statusValue,
    verified: false,
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
      heroId: hero.slug,
      matches: hero.matches,
      name: hero.name,
      slug: hero.slug,
      winRate: hero.winRate,
    })),
    gender: 'male',
    id: userId,
    playStyleTags: [...profileMockPlayStyleTags],
    rankName: 'Cao Thủ',
    region: 'Global',
    roleNames: ['Trợ Thủ'],
    showWinRate: true,
    stats: defaultProfileStats,
    statusLabel: 'Sẵn sàng',
    statusValue: 'ready',
    verified: true,
  };
}

function buildMinhAnhPreviewProfile(): ProfileViewModel {
  return {
    avatarUrl: undefined,
    bio: profileMockQuote,
    displayName: 'Minh Anh',
    favoriteHeroes: profileMockHeroes.map((hero) => ({
      heroId: hero.slug,
      matches: hero.matches,
      name: hero.name,
      slug: hero.slug,
      winRate: hero.winRate,
    })),
    gender: 'female',
    id: profileMockMinhAnhUserId,
    playStyleTags: [...profileMockPlayStyleTags],
    rankName: 'Cao Thủ',
    region: 'Global',
    roleNames: ['Trợ Thủ'],
    showWinRate: true,
    stats: defaultProfileStats,
    statusLabel: 'Sẵn sàng',
    statusValue: 'ready',
    verified: true,
  };
}

function isMinhAnhMockProfile(userId: string | undefined) {
  return userId === profileMockMinhAnhUserId;
}

type ProfileReadRecoveryOptions = {
  allowPartialRecovery?: boolean;
};

async function fetchUploadedProfileCover(
  session: AuthSession,
  ownerId: string,
  options: ProfileReadRecoveryOptions = {},
): Promise<{ id: string; url?: string } | undefined> {
  try {
    const rows = await supabaseRest<ProfileCoverMediaRow[]>(
      [
        'media_assets?select=id',
        `owner_id=eq.${encodeURIComponent(ownerId)}`,
        'purpose=eq.game_profile',
        'status=eq.ready',
        'moderation_status=eq.approved',
        'deleted_at=is.null',
        'order=created_at.asc',
        'limit=1',
      ].join('&'),
      { session },
    );

    const id = rows[0]?.id;
    return id ? { id, url: mediaUrl(id) } : undefined;
  } catch (error) {
    if (!options.allowPartialRecovery) throw error;
    console.warn('[profile] Cannot load uploaded profile cover media', error);
    return undefined;
  }
}

async function fetchProfileHeroRows(
  session: AuthSession,
  profileId: string,
  options: ProfileReadRecoveryOptions = {},
) {
  try {
    return await supabaseRest<ProfileHeroRow[]>(
      [
        'profile_heroes?select=hero_id,created_at,heroes(name,slug)',
        `profile_id=eq.${encodeURIComponent(profileId)}`,
        'order=created_at.asc',
      ].join('&'),
      { session },
    );
  } catch (error) {
    if (!options.allowPartialRecovery) throw error;
    console.warn('[profile] Cannot load profile heroes', error);
    return [];
  }
}

function buildFavoriteHeroes(
  rows: ProfileHeroRow[],
  useMockFallback: boolean,
  mediaSummary: MediaSummary = {},
): ProfileFavoriteHero[] {
  const statsByKey = favoriteHeroStatsFromSummary(mediaSummary);
  const heroes = compact(
    rows.map((row) => {
      const hero = first(row.heroes);
      const name = hero?.name?.trim();
      if (!name) return undefined;
      return applyFavoriteHeroStats(
        {
          heroId: row.hero_id,
          name,
          slug: hero?.slug ?? undefined,
        },
        statsByKey,
      );
    }),
  ).slice(0, 3);

  if (heroes.length || !useMockFallback) return heroes;

  return profileMockHeroes.map((hero) => ({
    heroId: hero.slug,
    matches: hero.matches,
    name: hero.name,
    slug: hero.slug,
    winRate: hero.winRate,
  }));
}

function applyFavoriteHeroStats(
  hero: ProfileFavoriteHero,
  statsByKey: Map<string, Pick<ProfileFavoriteHero, 'matches' | 'winRate'>>,
): ProfileFavoriteHero {
  const stat = heroStatKeys(hero)
    .map((key) => statsByKey.get(key))
    .find(Boolean);

  return stat ? { ...hero, ...stat } : hero;
}

function favoriteHeroStatsFromSummary(
  summary: MediaSummary,
): Map<string, Pick<ProfileFavoriteHero, 'matches' | 'winRate'>> {
  const source = summary.favorite_hero_stats;
  const statsByKey = new Map<
    string,
    Pick<ProfileFavoriteHero, 'matches' | 'winRate'>
  >();
  if (!Array.isArray(source)) return statsByKey;

  for (const item of source) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const stat = stripUndefined({
      matches: normalizeOptionalStatNumber(record.matches),
      winRate: normalizeOptionalStatNumber(record.win_rate ?? record.winRate),
    });
    if (stat.matches === undefined && stat.winRate === undefined) continue;

    for (const key of heroStatKeys({
      heroId: stringRecordValue(record.hero_id),
      name: stringRecordValue(record.name) ?? '',
      slug: stringRecordValue(record.slug),
    })) {
      statsByKey.set(key, stat);
    }
  }

  return statsByKey;
}

function buildFavoriteHeroStatsSummary(heroes: ProfileFavoriteHero[]) {
  return dedupeHeroes(heroes)
    .slice(0, 3)
    .map((hero, index) =>
      stripUndefined({
        hero_id: hero.heroId,
        matches: normalizeOptionalStatNumber(hero.matches),
        name: hero.name,
        order: index,
        slug: hero.slug,
        win_rate: normalizeOptionalStatNumber(hero.winRate),
      }),
    )
    .filter(
      (hero) => hero.matches !== undefined || hero.win_rate !== undefined,
    );
}

function heroStatKeys(
  hero: Pick<ProfileFavoriteHero, 'heroId' | 'name' | 'slug'>,
) {
  return Array.from(
    new Set(
      [
        hero.heroId,
        hero.slug ? normalizeHeroKey(hero.slug) : undefined,
        hero.name ? normalizeHeroKey(hero.name) : undefined,
      ].filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 3);
}

function stringRecordValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalStatNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(99999, Math.round(number)));
}

function buildHeroOptions(
  backendHeroes: HeroRow[],
  selectedHeroes: ProfileFavoriteHero[],
): ProfileHeroPickerOption[] {
  const bySlug = new Map<string, ProfileHeroPickerOption>();

  for (const hero of HEROES) {
    bySlug.set(toDbSlug(hero.id), {
      name: hero.name,
      role: hero.variant ?? hero.role,
      slug: toDbSlug(hero.id),
    });
  }

  for (const hero of backendHeroes) {
    bySlug.set(hero.slug, {
      heroId: hero.id,
      name: hero.name,
      slug: hero.slug,
      ...bySlug.get(hero.slug),
    });
  }

  for (const hero of selectedHeroes) {
    if (!hero.slug) continue;
    bySlug.set(hero.slug, {
      ...bySlug.get(hero.slug),
      ...hero,
      slug: hero.slug,
    });
  }

  return Array.from(bySlug.values()).sort((left, right) =>
    left.name.localeCompare(right.name, 'vi'),
  );
}

async function saveProfileHeroes(
  session: AuthSession,
  profileId: string,
  heroes: ProfileFavoriteHero[],
) {
  const selected = dedupeHeroes(heroes).slice(0, 3);
  const resolvedHeroes = await Promise.all(
    selected.map(async (hero) => ({
      hero,
      heroId: await resolveHeroId(session, hero),
    })),
  );
  const missingHero = resolvedHeroes.find((item) => !item.heroId)?.hero;

  if (missingHero) {
    throw new Error(
      `Chưa đồng bộ dữ liệu tướng “${missingHero.name}”. Vui lòng cập nhật dữ liệu và thử lại.`,
    );
  }

  const resolvedHeroIds = resolvedHeroes
    .map((item) => item.heroId)
    .filter((heroId): heroId is string => Boolean(heroId));

  await supabaseRest(
    `profile_heroes?profile_id=eq.${encodeURIComponent(profileId)}`,
    { method: 'DELETE', prefer: 'return=minimal', session },
  );

  for (const heroId of resolvedHeroIds) {
    await supabaseRest('profile_heroes?on_conflict=profile_id,hero_id', {
      body: { hero_id: heroId, profile_id: profileId },
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      session,
    });
  }
}

async function resolveHeroId(session: AuthSession, hero: ProfileFavoriteHero) {
  if (hero.heroId && isUuid(hero.heroId)) return hero.heroId;
  const slug = hero.slug ? normalizeSlug(hero.slug) : normalizeSlug(hero.name);
  const rows = await supabaseRest<HeroRow[]>(
    `heroes?select=id,slug,name&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { session },
  );

  return rows[0]?.id;
}

function dedupeHeroes(heroes: ProfileFavoriteHero[]) {
  const seen = new Set<string>();
  const deduped: ProfileFavoriteHero[] = [];
  for (const hero of heroes) {
    const key = normalizeHeroKey(hero.slug ?? hero.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(hero);
  }
  return deduped;
}

function toReferenceOption(row: RankRow | RoleRow): ProfileReferenceOption {
  return { id: row.id, label: row.name, slug: row.slug };
}

function buildEditHabits(
  habits: ProfileEditHabitEmbed | undefined,
): ProfileEditHabits {
  const merged = {
    ...defaultEditHabits,
    ...stripUndefined({
      comeback_response: habits?.comeback_response,
      communication_channels: habits?.communication_channels,
      decision_style: habits?.decision_style,
      feedback_style: habits?.feedback_style,
      loss_response: habits?.loss_response,
      media_summary: habits?.media_summary,
      online_time_presets: habits?.online_time_presets,
      seriousness: habits?.seriousness,
      session_length: habits?.session_length,
      strategy_styles: habits?.strategy_styles,
      team_atmospheres: habits?.team_atmospheres,
      team_goals: habits?.team_goals,
    }),
  } as ProfileEditHabits;

  return normalizeEditHabits(merged);
}

function normalizeDisplayName(value: string) {
  const displayName = value.replace(/\s+/g, ' ').trim();
  if (displayName.length < 2) {
    throw new Error('Tên hiển thị cần ít nhất 2 ký tự.');
  }
  if (displayName.length > 20) {
    throw new Error('Tên hiển thị tối đa 20 ký tự.');
  }
  return displayName;
}

function normalizeBio(value: string) {
  const bio = value.replace(/\s+/g, ' ').trim();
  if (bio.length > 80) {
    throw new Error('Câu giới thiệu tối đa 80 ký tự.');
  }
  return bio;
}

function normalizeRegion(value: string) {
  return value.trim().toLowerCase() || 'global';
}

function normalizeEditHabits(input: ProfileEditHabits): ProfileEditHabits {
  return {
    comeback_response:
      input.comeback_response.trim() || defaultEditHabits.comeback_response,
    communication_channels: compactUnique(input.communication_channels, 2),
    decision_style:
      input.decision_style.trim() || defaultEditHabits.decision_style,
    feedback_style:
      input.feedback_style.trim() || defaultEditHabits.feedback_style,
    loss_response:
      input.loss_response.trim() || defaultEditHabits.loss_response,
    media_summary: mediaSummaryRecord(input.media_summary),
    online_time_presets: compactUnique(input.online_time_presets, 5),
    seriousness: input.seriousness.trim() || defaultEditHabits.seriousness,
    session_length:
      input.session_length.trim() || defaultEditHabits.session_length,
    strategy_styles: compactUnique(input.strategy_styles, 3),
    team_atmospheres: compactUnique(input.team_atmospheres, 2),
    team_goals: compactUnique(input.team_goals, 2),
  };
}

function compactUnique(values: readonly string[], limit: number) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).slice(0, limit);
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== null,
    ),
  ) as Partial<T>;
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

  return tags;
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
  if (typeof preferred === 'string' && preferred.trim())
    return preferred.trim();
  return session?.user.email?.split('@')[0];
}

function avatarUrlFromSession(session: AuthSession | null) {
  const metadata = session?.user.user_metadata;
  const candidates = [
    metadata?.avatar_url,
    metadata?.avatar,
    metadata?.photo_url,
    metadata?.profile_image,
    metadata?.picture,
    metadata?.picture_url,
  ];
  return candidates.find(
    (value): value is string =>
      typeof value === 'string' && Boolean(value.trim()),
  );
}

export function profileMediaUrl(assetId: string | null | undefined) {
  return mediaUrl(assetId);
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
  const normalized = value.toLowerCase();
  if (normalized === 'global') return 'Global';
  if (normalized === 'vn') return 'VN';
  if (normalized === 'sea') return 'SEA';
  return value.toUpperCase();
}

function profileGenderFromSummary(summary: MediaSummary): ProfileGender {
  const basics = mediaSummaryRecord(summary.profile_basics);
  return normalizeProfileGender(basics.gender ?? summary.gender);
}

function normalizeProfileGender(value: unknown): ProfileGender {
  if (value === 'male' || value === 'female') return value;
  return 'hidden';
}

function profileStatsFromSummary(
  summary: MediaSummary,
  fallback: ProfileStats = defaultProfileStats,
): ProfileStats {
  const stats = mediaSummaryRecord(summary.profile_stats);
  return normalizeProfileStats(
    {
      matches: stats.matches,
      rating: stats.rating,
      reputation: stats.reputation,
      winRate: stats.win_rate ?? stats.winRate,
    },
    fallback,
  );
}

function normalizeProfileStats(
  value: Partial<Record<keyof ProfileStats, unknown>>,
  fallback: ProfileStats = defaultProfileStats,
): ProfileStats {
  return {
    matches: normalizeStatNumber(value.matches, fallback.matches, 0, 99999),
    rating: normalizeRatingNumber(value.rating, fallback.rating),
    reputation: normalizeStatNumber(
      value.reputation,
      fallback.reputation,
      0,
      100,
    ),
    winRate: normalizeStatNumber(value.winRate, fallback.winRate, 0, 100),
  };
}

function normalizeStatNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeRatingNumber(
  value: unknown,
  fallback = defaultProfileStats.rating,
) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(5, Math.round(number * 10) / 10));
}

function showWinRateFromSummary(summary: MediaSummary) {
  const settings = mediaSummaryRecord(summary.settings);
  return settings.show_win_rate === true;
}

function statusFromSummary(summary: MediaSummary): ProfileStatusValue {
  return normalizeStatus(summary.profile_status);
}

function normalizeStatus(value: unknown): ProfileStatusValue {
  if (
    value === 'ready' ||
    value === 'busy' ||
    value === 'offline' ||
    value === 'friends'
  ) {
    return value;
  }
  return 'offline';
}

function statusLabel(value: ProfileStatusValue) {
  if (value === 'busy') return 'Đang bận';
  if (value === 'offline') return 'Offline';
  if (value === 'friends') return 'Chỉ bạn bè';
  return 'Sẵn sàng';
}

function mediaSummaryRecord(value: unknown): MediaSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as MediaSummary;
}

function mediaIdFromSummary(summary: MediaSummary, key: string) {
  const value = summary[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toDbSlug(value: string) {
  return value.replace(/-/g, '_');
}

function normalizeSlug(value: string) {
  return toDbSlug(normalizeHeroKey(value));
}

function normalizeHeroKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function first<T>(value: MaybeArray<T>) {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function compact<T>(values: (T | null | undefined)[]) {
  return values.filter(
    (value): value is T => value !== null && value !== undefined,
  );
}
