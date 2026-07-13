import { HEROES } from '@/entities/hero';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  profileMediaUrl,
  type ProfileFavoriteHero,
  type ProfileHeroPickerOption,
  type ProfileReferenceOption,
  type ProfileStats,
} from '../../services/profile-service';
import type {
  ProfileEditDraft,
  ProfileEditHabitAnswers,
} from '../model/profile-edit-model';

type MaybeArray<T> = T | T[] | null | undefined;

type ProfileEditGameProfileRow = {
  handle: string | null;
  rank_id: string | null;
  server_region: string | null;
};

type ProfileEditHabitRow = {
  comeback_response: string | null;
  communication_channels: string[] | null;
  decision_style: string | null;
  feedback_style: string | null;
  loss_response: string | null;
  media_summary: unknown | null;
  online_time_presets: string[] | null;
  seriousness: string | null;
  session_length: string | null;
  strategy_styles: string[] | null;
  team_atmospheres: string[] | null;
  team_goals: string[] | null;
};

type ProfileEditRow = {
  avatar_media_id: string | null;
  bio: string | null;
  display_name: string | null;
  game_profiles?: MaybeArray<ProfileEditGameProfileRow>;
  id: string;
  profile_habits?: MaybeArray<ProfileEditHabitRow>;
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

type ProfileRoleRow = {
  created_at: string;
  role_id: string;
};

type HeroRow = {
  id: string;
  name: string;
  slug: string;
};

type HeroEmbed = {
  name: string | null;
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
  id: string;
  starts_at: string;
};

type HeroStatSummary = {
  heroId?: string;
  matches?: number;
  name?: string;
  order?: number;
  slug?: string;
  winRate?: number;
};

const profileEditSelect = [
  'id',
  'display_name',
  'bio',
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

const editableRoleOrder = ['slayer', 'jungle', 'mid', 'dragon', 'support'];

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
    supabaseRest<RankRow[]>(
      'ranks?select=id,slug,name,sort_order&order=sort_order.asc',
      { session },
    ),
    supabaseRest<RoleRow[]>('roles?select=id,slug,name&order=name.asc', {
      session,
    }),
    supabaseRest<ProfileRoleRow[]>(
      [
        'profile_roles?select=role_id,created_at',
        `profile_id=eq.${encodeURIComponent(profileId)}`,
        'order=created_at.asc',
      ].join('&'),
      { session },
    ),
    fetchProfileHeroRows(session, profileId),
    supabaseRest<HeroRow[]>('heroes?select=id,slug,name&order=name.asc', {
      session,
    }),
    supabaseRest<AvailabilitySlotRow[]>(
      [
        'availability_slots?select=id,day_of_week,starts_at,ends_at',
        `profile_id=eq.${encodeURIComponent(profileId)}`,
        'order=day_of_week.asc,starts_at.asc',
      ].join('&'),
      { session },
    ).catch(() => [] as AvailabilitySlotRow[]),
  ]);

  const row = profileRows[0];
  if (!row) throw new Error('Không tìm thấy hồ sơ để chỉnh sửa.');

  const gameProfile = first(row.game_profiles);
  const habitRow = first(row.profile_habits);
  const mediaSummary = mediaSummaryRecord(habitRow?.media_summary);
  const coverMediaId = stringValue(mediaSummary.cover_media_id) ?? null;
  const avatarMediaId = row.avatar_media_id ?? null;
  const favoriteHeroes = buildFavoriteHeroes(selectedHeroes, mediaSummary);
  const roleOptions = roles
    .filter((role) => editableRoleOrder.includes(role.slug))
    .sort(
      (left, right) =>
        editableRoleOrder.indexOf(left.slug) -
        editableRoleOrder.indexOf(right.slug),
    )
    .map(toReferenceOption);

  return {
    availabilitySlots: availabilitySlots.map((slot) => ({
      dayOfWeek: slot.day_of_week,
      endsAt: slot.ends_at,
      id: slot.id,
      startsAt: slot.starts_at,
    })),
    form: {
      availability: {
        presets: habitRow
          ? cloneStringArray(habitRow.online_time_presets)
          : undefined,
      },
      gameProfile: {
        handle: gameProfile?.handle ?? '',
        rankId: gameProfile?.rank_id ?? undefined,
      },
      habits: buildHabitAnswers(habitRow),
      heroes: favoriteHeroes,
      identity: {
        bio: row.bio ?? '',
        displayName: row.display_name ?? '',
        gender: profileGenderFromSummary(mediaSummary),
        stats: profileStatsFromSummary(mediaSummary),
        status: statusFromSummary(mediaSummary),
      },
      lanes: {
        roleIds: selectedRoles.map((item) => item.role_id),
      },
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
    heroOptions: buildHeroOptions(backendHeroes, favoriteHeroes),
    id: row.id,
    mediaSummary,
    meta: {
      hasGameProfileRecord: Boolean(gameProfile),
      hasHabitRecord: Boolean(habitRow),
      serverRegion: gameProfile?.server_region ?? undefined,
    },
    ranks: ranks.map(toReferenceOption),
    roles: roleOptions,
  };
}

function buildHabitAnswers(
  row: ProfileEditHabitRow | undefined,
): ProfileEditHabitAnswers {
  if (!row) return {};
  return stripUndefined({
    comeback_response: stringValue(row.comeback_response),
    communication_channels: cloneStringArray(row.communication_channels),
    decision_style: stringValue(row.decision_style),
    feedback_style: stringValue(row.feedback_style),
    loss_response: stringValue(row.loss_response),
    seriousness: stringValue(row.seriousness),
    session_length: stringValue(row.session_length),
    strategy_styles: cloneStringArray(row.strategy_styles),
    team_atmospheres: cloneStringArray(row.team_atmospheres),
    team_goals: cloneStringArray(row.team_goals),
  });
}

async function fetchProfileHeroRows(session: AuthSession, profileId: string) {
  return supabaseRest<ProfileHeroRow[]>(
    [
      'profile_heroes?select=hero_id,created_at,heroes(name,slug)',
      `profile_id=eq.${encodeURIComponent(profileId)}`,
      'order=created_at.asc',
    ].join('&'),
    { session },
  ).catch(() => [] as ProfileHeroRow[]);
}

function buildFavoriteHeroes(
  rows: ProfileHeroRow[],
  mediaSummary: Record<string, unknown>,
): ProfileFavoriteHero[] {
  const stats = heroStatsFromSummary(mediaSummary);
  const heroes = rows
    .map((row, fallbackOrder) => {
      const hero = first(row.heroes);
      const name = stringValue(hero?.name);
      if (!name) return undefined;
      const stat = findHeroStat(stats, {
        heroId: row.hero_id,
        name,
        slug: stringValue(hero?.slug),
      });
      return {
        heroId: row.hero_id,
        matches: stat?.matches,
        name,
        order: stat?.order ?? fallbackOrder,
        slug: stringValue(hero?.slug),
        winRate: stat?.winRate,
      };
    })
    .filter((hero): hero is NonNullable<typeof hero> => Boolean(hero))
    .sort((left, right) => left.order - right.order)
    .slice(0, 3);

  return heroes.map(({ order: _order, ...hero }) => hero);
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
        name: stringValue(row.name),
        order: optionalNumber(row.order, 2),
        slug: stringValue(row.slug),
        winRate: optionalNumber(row.win_rate ?? row.winRate, 100),
      });
    })
    .filter((item): item is HeroStatSummary => Boolean(item));
}

function findHeroStat(
  stats: HeroStatSummary[],
  hero: Pick<ProfileFavoriteHero, 'heroId' | 'name' | 'slug'>,
) {
  const keys = heroKeys(hero);
  return stats.find((stat) => heroKeys(stat).some((key) => keys.includes(key)));
}

function buildHeroOptions(
  backendHeroes: HeroRow[],
  selectedHeroes: ProfileFavoriteHero[],
): ProfileHeroPickerOption[] {
  const bySlug = new Map<string, ProfileHeroPickerOption>();
  for (const hero of HEROES) {
    const slug = toDbSlug(hero.id);
    bySlug.set(slug, {
      name: hero.name,
      role: hero.variant ?? hero.role,
      slug,
    });
  }
  for (const hero of backendHeroes) {
    bySlug.set(hero.slug, {
      ...bySlug.get(hero.slug),
      heroId: hero.id,
      name: hero.name,
      slug: hero.slug,
    });
  }
  for (const hero of selectedHeroes) {
    const slug = hero.slug ?? normalizeKey(hero.name);
    bySlug.set(slug, { ...bySlug.get(slug), ...hero, slug });
  }
  return [...bySlug.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'vi'),
  );
}

function profileGenderFromSummary(summary: Record<string, unknown>) {
  const basics = mediaSummaryRecord(summary.profile_basics);
  return stringValue(basics.gender);
}

function statusFromSummary(summary: Record<string, unknown>) {
  return stringValue(summary.profile_status);
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

function toReferenceOption(row: RankRow | RoleRow): ProfileReferenceOption {
  return { id: row.id, label: row.name, slug: row.slug };
}

function heroKeys(hero: { heroId?: string; name?: string; slug?: string }) {
  return [hero.heroId, hero.slug, hero.name]
    .map((value) => (value ? normalizeKey(value) : ''))
    .filter(Boolean);
}

function toDbSlug(value: string) {
  return normalizeKey(value).replace(/-/g, '_');
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mediaSummaryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cloneStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? [...value] : undefined;
}

function first<T>(value: MaybeArray<T>): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
