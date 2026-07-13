import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { ProfileFavoriteHero } from '../../../services/profile-service';
import { ProfileEditCommandError } from './profile-edit-command-error';
import {
  isUuid,
  normalizeKey,
  normalizeOptionalNumber,
  normalizeSlug,
  stripUndefined,
} from './profile-edit-command-utils';
import { patchProfileMediaSummary } from './profile-edit-media-summary';

type HeroLookupRow = { id: string; name: string; slug: string };

export async function saveProfileHeroes(input: {
  baselineHeroes: readonly ProfileFavoriteHero[];
  currentHeroes: readonly ProfileFavoriteHero[];
  hasHabitRecord: boolean;
  profileId: string;
  session: AuthSession;
}) {
  if (!input.hasHabitRecord) {
    throw new ProfileEditCommandError(
      'Không thể lưu tướng hoặc thứ tự vì profile_habits chưa tồn tại. Không có record cũ nào bị thay đổi.',
    );
  }

  const previous = dedupeHeroes(input.baselineHeroes).slice(0, 3);
  const selected = dedupeHeroes(input.currentHeroes).slice(0, 3);
  const resolved = await Promise.all(
    selected.map(async (hero) => ({
      hero,
      heroId: await resolveHeroId(input.session, hero),
    })),
  );
  const unresolved = resolved.find((item) => !item.heroId);
  if (unresolved) {
    throw new ProfileEditCommandError(
      `Chưa đồng bộ dữ liệu tướng “${unresolved.hero.name}”. Không có tướng cũ nào bị xoá.`,
    );
  }

  const previousIds = previous
    .map((hero) => hero.heroId)
    .filter((value): value is string => Boolean(value));
  const selectedIds = resolved
    .map((item) => item.heroId)
    .filter((value): value is string => Boolean(value));
  const additions = selectedIds.filter(
    (heroId) => !previousIds.includes(heroId),
  );
  const removals = previousIds.filter(
    (heroId) => !selectedIds.includes(heroId),
  );
  let databaseChanged = false;

  try {
    // A failed replacement may leave an extra hero temporarily, never a gap.
    for (const heroId of additions) {
      await supabaseRest('profile_heroes?on_conflict=profile_id,hero_id', {
        body: { hero_id: heroId, profile_id: input.profileId },
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        session: input.session,
      });
      databaseChanged = true;
    }

    await patchProfileMediaSummary(
      input.session,
      input.profileId,
      (summary) => ({
        ...summary,
        favorite_hero_stats: selected.map((hero, order) =>
          stripUndefined({
            hero_id: resolved[order]?.heroId,
            matches: normalizeOptionalNumber(hero.matches, 99999),
            name: hero.name,
            order,
            slug: hero.slug,
            win_rate: normalizeOptionalNumber(hero.winRate, 100),
          }),
        ),
      }),
    );
    databaseChanged = true;

    for (const heroId of removals) {
      await supabaseRest(
        [
          'profile_heroes?',
          `profile_id=eq.${encodeURIComponent(input.profileId)}`,
          `&hero_id=eq.${encodeURIComponent(heroId)}`,
        ].join(''),
        { method: 'DELETE', prefer: 'return=minimal', session: input.session },
      );
      databaseChanged = true;
    }
  } catch (error) {
    if (error instanceof ProfileEditCommandError) {
      throw new ProfileEditCommandError(error.message, {
        cause: error,
        partiallySaved: databaseChanged || error.partiallySaved,
      });
    }
    throw new ProfileEditCommandError(
      'Tướng tủ chỉ được lưu một phần. Replacement được giữ và tướng cũ chỉ bị xoá sau khi metadata mới đã sẵn sàng.',
      { cause: error, partiallySaved: databaseChanged },
    );
  }
}

async function resolveHeroId(session: AuthSession, hero: ProfileFavoriteHero) {
  if (hero.heroId && isUuid(hero.heroId)) return hero.heroId;
  const slug = normalizeSlug(hero.slug ?? hero.name);
  const rows = await supabaseRest<HeroLookupRow[]>(
    `heroes?select=id,slug,name&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { session },
  );
  return rows[0]?.id;
}

function dedupeHeroes(heroes: readonly ProfileFavoriteHero[]) {
  const seen = new Set<string>();
  return heroes.filter((hero) => {
    const key = normalizeKey(hero.slug ?? hero.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
