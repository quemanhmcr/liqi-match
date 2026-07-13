import { heroDefinitionById } from '@/entities/hero';
import {
  FavoriteHeroSelectionsSchema,
  type HeroId,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { ProfileEditHero } from '../../model/profile-edit-model';
import { ProfileEditCommandError } from './profile-edit-command-error';
import {
  normalizeOptionalNumber,
  stripUndefined,
} from './profile-edit-command-utils';
import { patchProfileMediaSummary } from './profile-edit-media-summary';

export async function saveProfileHeroes(input: {
  baselineHeroes: readonly ProfileEditHero[];
  currentHeroes: readonly ProfileEditHero[];
  hasHabitRecord: boolean;
  heroDbIds: Partial<Record<HeroId, string>>;
  heroesLossless: boolean;
  profileId: string;
  session: AuthSession;
}) {
  if (!input.hasHabitRecord) {
    throw new ProfileEditCommandError(
      'Không thể lưu tướng hoặc thứ tự vì profile_habits chưa tồn tại. Không có record cũ nào bị thay đổi.',
    );
  }
  if (!input.heroesLossless) {
    throw new ProfileEditCommandError(
      'Danh sách hero legacy chưa resolve losslessly. Hãy xử lý giá trị unsupported trước khi lưu.',
    );
  }

  const previous = validateHeroes(input.baselineHeroes);
  const selected = validateHeroes(input.currentHeroes);
  const previousIds = previous.map((hero) =>
    dbHeroId(hero.heroId, input.heroDbIds),
  );
  const selectedIds = selected.map((hero) =>
    dbHeroId(hero.heroId, input.heroDbIds),
  );
  const additions = selectedIds.filter(
    (heroId) => !previousIds.includes(heroId),
  );
  const removals = previousIds.filter(
    (heroId) => !selectedIds.includes(heroId),
  );
  let databaseChanged = false;

  try {
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
        favorite_hero_stats: selected.map((hero, order) => {
          const definition = heroDefinitionById(hero.heroId);
          if (!definition) {
            throw new ProfileEditCommandError(
              `Không tìm thấy canonical hero “${hero.heroId}”.`,
            );
          }
          return stripUndefined({
            hero_id: selectedIds[order],
            matches: normalizeOptionalNumber(hero.matches, 99999),
            name: definition.name,
            order,
            slug: definition.legacySlug,
            win_rate: normalizeOptionalNumber(hero.winRate, 100),
          });
        }),
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

function validateHeroes(heroes: readonly ProfileEditHero[]) {
  const canonical = FavoriteHeroSelectionsSchema.parse(
    heroes.map(({ heroId, priority }) => ({ heroId, priority })),
  );
  return canonical.map((selection) => {
    const source = heroes.find((hero) => hero.heroId === selection.heroId)!;
    return { ...source, ...selection };
  });
}

function dbHeroId(heroId: HeroId, dbIds: Partial<Record<HeroId, string>>) {
  const dbId = dbIds[heroId];
  if (!dbId) {
    throw new ProfileEditCommandError(
      `Hero canonical “${heroId}” chưa có DB UUID trong edit draft.`,
    );
  }
  return dbId;
}
