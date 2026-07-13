import {
  GENDER_CATALOG,
  LANE_CATALOG,
  RANK_CATALOG,
  RecurringAvailabilitySchema,
  adaptLegacyHabitAnswers,
  resolveCatalogId,
  resolveHeroId,
  type GenderId,
  type HeroId,
  type LaneSelection,
  type LaneSlug,
  type RankId,
  type RecurringAvailability,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  profileMediaUrl,
  type ProfileStats,
} from '../../services/profile-service';
import type {
  ProfileEditDraft,
  ProfileEditHero,
  ProfileEditReadIssue,
} from '../model/profile-edit-model';

type MaybeArray<T> = T | T[] | null | undefined;

type ProfileEditGameProfileRow = {
  handle: string | null;
  rank_id: string | null;
  server_region: string | null;
};

type ProfileEditHabitRow = {
  comeback_response: unknown;
  communication_channels: unknown;
  decision_style: unknown;
  feedback_style: unknown;
  loss_response: unknown;
  media_summary: unknown | null;
  online_time_presets: unknown;
  seriousness: unknown;
  session_length: unknown;
  strategy_styles: unknown;
  team_atmospheres: unknown;
  team_goals: unknown;
};

type ProfileEditRow = {
  avatar_media_id: string | null;
  bio: string | null;
  display_name: string | null;
  game_profiles?: MaybeArray<ProfileEditGameProfileRow>;
  id: string;
  profile_habits?: MaybeArray<ProfileEditHabitRow>;
  timezone: string | null;
};

type RankRow = {
  id: string;
  slug: string;
};

type RoleRow = {
  id: string;
  slug: string;
};

type ProfileRoleRow = {
  created_at: string;
  role_id: string;
};

type HeroRow = {
  id: string;
  slug: string;
};

type HeroEmbed = {
  slug: string | null;
};

type ProfileHeroRow = {
  created_at: string;
  hero_id: string;
  heroes?: MaybeArray<HeroEmbed>;
};

type AvailabilitySlotRow = {
  day_of_week: number;
  ends_at: string;
  starts_at: string;
};

type HeroStatSummary = {
  heroId?: string;
  matches?: number;
  order?: number;
  slug?: string;
  winRate?: number;
};

const profileEditSelect = [
  'id',
  'display_name',
  'bio',
  'timezone',
  'avatar_media_id',
  'game_profiles(handle,rank_id,server_region)',
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
  const [
    profileRows,
    ranks,
    roles,
    selectedRoles,
    selectedHeroes,
    backendHeroes,
    availabilitySlots,
  ] = await Promise.all([
    supabaseRest<ProfileEditRow[]>(
      `profiles?id=eq.${encodeURIComponent(profileId)}&select=${profileEditSelect}&limit=1`,
      { session },
    ),
    supabaseRest<RankRow[]>('ranks?select=id,slug&order=sort_order.asc', {
      session,
    }),
    supabaseRest<RoleRow[]>('roles?select=id,slug&order=name.asc', { session }),
    supabaseRest<ProfileRoleRow[]>(
      [
        'profile_roles?select=role_id,created_at',
        `profile_id=eq.${encodeURIComponent(profileId)}`,
        'order=created_at.asc',
      ].join('&'),
      { session },
    ),
    fetchProfileHeroRows(session, profileId),
    supabaseRest<HeroRow[]>('heroes?select=id,slug&order=name.asc', {
      session,
    }),
    supabaseRest<AvailabilitySlotRow[]>(
      [
        'availability_slots?select=day_of_week,starts_at,ends_at',
        `profile_id=eq.${encodeURIComponent(profileId)}`,
        'order=day_of_week.asc,starts_at.asc',
      ].join('&'),
      { session },
    ).catch(() => [] as AvailabilitySlotRow[]),
  ]);

  const row = profileRows[0];
  if (!row) throw new Error('Không tìm thấy hồ sơ để chỉnh sửa.');

  const issues: ProfileEditReadIssue[] = [];
  const gameProfile = first(row.game_profiles);
  const habitRow = first(row.profile_habits);
  const habits = adaptLegacyHabitAnswers(habitRow);
  const mediaSummary = mediaSummaryRecord(habitRow?.media_summary);
  const coverMediaId = stringValue(mediaSummary.cover_media_id) ?? null;
  const avatarMediaId = row.avatar_media_id ?? null;
  const rankDbIds = buildRankDbIds(ranks);
  const laneDbIds = buildLaneDbIds(roles);
  const heroDbIds = buildHeroDbIds(backendHeroes);
  const rankId = resolveSelectedRank(gameProfile?.rank_id, ranks, issues);
  const laneResult = buildLaneSelection(selectedRoles, roles, issues);
  const heroResult = buildFavoriteHeroes(selectedHeroes, mediaSummary, issues);
  const availability = buildAvailability(
    availabilitySlots,
    row.timezone,
    issues,
  );

  return {
    form: {
      availability,
      gameProfile: {
        handle: gameProfile?.handle ?? '',
        rankId,
      },
      habits: habits.value,
      heroes: heroResult.heroes,
      identity: {
        bio: row.bio ?? '',
        displayName: row.display_name ?? '',
        genderId: resolveGender(mediaSummary, issues),
        stats: profileStatsFromSummary(mediaSummary),
        status: stringValue(mediaSummary.profile_status),
      },
      laneSelection: laneResult.selection,
      media: {
        avatarFallbackUrl: avatarUrlFromSession(session),
        avatarMediaId,
        avatarUrl:
          profileMediaUrl(avatarMediaId) ?? avatarUrlFromSession(session),
        coverMediaId,
        coverUrl: profileMediaUrl(coverMediaId),
        staged: {},
      },
    },
    id: row.id,
    mediaSummary,
    meta: {
      habitIssues: habits.issues,
      habitsLossless: habits.lossless,
      hasGameProfileRecord: Boolean(gameProfile),
      hasHabitRecord: Boolean(habitRow),
      heroDbIds,
      heroesLossless: heroResult.lossless,
      laneDbIds,
      lanesLossless: laneResult.lossless,
      rankDbIds,
      readIssues: issues,
      serverRegion: gameProfile?.server_region ?? undefined,
    },
  };
}

function buildRankDbIds(rows: RankRow[]) {
  const values: Partial<Record<RankId, string>> = {};
  for (const row of rows) {
    const resolution = resolveCatalogId(RANK_CATALOG, row.slug);
    if (resolution.ok) values[resolution.id] = row.id;
  }
  return values;
}

function buildLaneDbIds(rows: RoleRow[]) {
  const values: Partial<Record<LaneSlug, string>> = {};
  for (const row of rows) {
    const resolution = resolveCatalogId(LANE_CATALOG, row.slug);
    if (resolution.ok) values[resolution.id] = row.id;
  }
  return values;
}

function buildHeroDbIds(rows: HeroRow[]) {
  const values: Partial<Record<HeroId, string>> = {};
  for (const row of rows) {
    const resolution = resolveHeroId(row.slug);
    if (resolution.ok) values[resolution.id] = row.id;
  }
  return values;
}

function resolveSelectedRank(
  rankDbId: string | null | undefined,
  rows: RankRow[],
  issues: ProfileEditReadIssue[],
): RankId | null {
  if (!rankDbId) return null;
  const row = rows.find((candidate) => candidate.id === rankDbId);
  const resolution = resolveCatalogId(RANK_CATALOG, row?.slug);
  if (resolution.ok) return resolution.id;
  issues.push({
    code: 'unknown_rank',
    path: 'gameProfile.rankId',
    value: row?.slug ?? rankDbId,
  });
  return null;
}

function buildLaneSelection(
  selectedRows: ProfileRoleRow[],
  roles: RoleRow[],
  issues: ProfileEditReadIssue[],
): { lossless: boolean; selection: LaneSelection | null } {
  const resolved: LaneSlug[] = [];
  let lossless = true;
  for (const selected of selectedRows) {
    const role = roles.find((candidate) => candidate.id === selected.role_id);
    const resolution = resolveCatalogId(LANE_CATALOG, role?.slug);
    if (!resolution.ok) {
      lossless = false;
      issues.push({
        code: 'unknown_lane',
        path: 'laneSelection',
        value: role?.slug ?? selected.role_id,
      });
      continue;
    }
    if (!resolved.includes(resolution.id)) resolved.push(resolution.id);
  }
  if (resolved.length > 2) {
    issues.push({
      code: 'lane_selection_unrepresentable',
      path: 'laneSelection',
      value: resolved,
    });
    return { lossless: false, selection: null };
  }
  return {
    lossless,
    selection: resolved[0]
      ? { primary: resolved[0], secondary: resolved[1] ?? null }
      : null,
  };
}

async function fetchProfileHeroRows(session: AuthSession, profileId: string) {
  return supabaseRest<ProfileHeroRow[]>(
    [
      'profile_heroes?select=hero_id,created_at,heroes(slug)',
      `profile_id=eq.${encodeURIComponent(profileId)}`,
      'order=created_at.asc',
    ].join('&'),
    { session },
  ).catch(() => [] as ProfileHeroRow[]);
}

function buildFavoriteHeroes(
  rows: ProfileHeroRow[],
  mediaSummary: Record<string, unknown>,
  issues: ProfileEditReadIssue[],
): { heroes: ProfileEditHero[]; lossless: boolean } {
  const stats = heroStatsFromSummary(mediaSummary);
  const resolved: (ProfileEditHero & { sourceOrder: number })[] = [];
  let lossless = true;

  for (const [sourceOrder, row] of rows.entries()) {
    const hero = first(row.heroes);
    const resolution = resolveHeroId(hero?.slug);
    if (!resolution.ok) {
      lossless = false;
      issues.push({
        code: 'unknown_hero',
        path: 'heroes',
        value: hero?.slug ?? row.hero_id,
      });
      continue;
    }
    const stat = stats.find(
      (candidate) =>
        candidate.heroId === row.hero_id || candidate.slug === hero?.slug,
    );
    resolved.push({
      heroId: resolution.id,
      matches: stat?.matches,
      priority: (stat?.order ?? sourceOrder) + 1,
      sourceOrder,
      winRate: stat?.winRate,
    });
  }

  if (resolved.length > 3) {
    issues.push({
      code: 'hero_selection_unrepresentable',
      path: 'heroes',
      value: resolved.map((hero) => hero.heroId),
    });
    return { heroes: [], lossless: false };
  }

  const heroes = resolved
    .sort(
      (left, right) =>
        left.priority - right.priority || left.sourceOrder - right.sourceOrder,
    )
    .map(({ sourceOrder: _sourceOrder, ...hero }, index) => ({
      ...hero,
      priority: index + 1,
    }));
  return { heroes, lossless };
}

function heroStatsFromSummary(summary: Record<string, unknown>) {
  if (!Array.isArray(summary.favorite_hero_stats)) return [];
  return summary.favorite_hero_stats
    .map((value): HeroStatSummary | undefined => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const row = value as Record<string, unknown>;
      return stripUndefined({
        heroId: stringValue(row.hero_id),
        matches: optionalNumber(row.matches, 99999),
        order: optionalNumber(row.order, 2),
        slug: stringValue(row.slug),
        winRate: optionalNumber(row.win_rate ?? row.winRate, 100),
      });
    })
    .filter((item): item is HeroStatSummary => Boolean(item));
}

function resolveGender(
  summary: Record<string, unknown>,
  issues: ProfileEditReadIssue[],
): GenderId | null {
  const raw = mediaSummaryRecord(summary.profile_basics).gender;
  if (raw === null || raw === undefined) return null;
  const resolution = resolveCatalogId(GENDER_CATALOG, raw);
  if (resolution.ok) return resolution.id;
  issues.push({
    code: 'unknown_gender',
    path: 'identity.genderId',
    value: raw,
  });
  return null;
}

function buildAvailability(
  rows: AvailabilitySlotRow[],
  timezone: string | null,
  issues: ProfileEditReadIssue[],
): RecurringAvailability | null {
  if (!rows.length) return null;
  const candidate = {
    slots: rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      endMinute: parseClockMinute(row.ends_at, true),
      startMinute: parseClockMinute(row.starts_at, false),
    })),
    timezone: timezone ?? '',
  };
  const parsed = RecurringAvailabilitySchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  issues.push({
    code: 'invalid_availability',
    path: 'availability',
    value: candidate,
  });
  return null;
}

function parseClockMinute(value: string, isEnd: boolean) {
  if (isEnd && value === '23:59:59') return 24 * 60;
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function profileStatsFromSummary(
  summary: Record<string, unknown>,
): Partial<ProfileStats> | undefined {
  const source = mediaSummaryRecord(summary.profile_stats);
  const stats = stripUndefined({
    matches: optionalNumber(source.matches, 99999),
    rating: optionalRating(source.rating),
    reputation: optionalNumber(source.reputation, 100),
    winRate: optionalNumber(source.win_rate ?? source.winRate, 100),
  });
  return Object.keys(stats).length ? stats : undefined;
}

function optionalNumber(value: unknown, max: number) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function optionalRating(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(5, Math.round(number * 10) / 10));
}

function avatarUrlFromSession(session: AuthSession) {
  const metadata = session.user.user_metadata ?? {};
  const candidates = [metadata.avatar_url, metadata.picture];
  return candidates.find(
    (value): value is string =>
      typeof value === 'string' && Boolean(value.trim()),
  );
}

function mediaSummaryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function first<T>(value: MaybeArray<T>): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
