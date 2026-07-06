import { HEROES } from '@/features/onboarding/hero-selection-data';
import {
  dbSlug,
  type OnboardingSnapshot,
} from '@/features/onboarding/onboarding-store';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';
import type { Tables } from '@/shared/types/database.types';

export async function completeOnboardingProfile(
  session: AuthSession,
  snapshot: OnboardingSnapshot,
) {
  const displayName = displayNameFromSession(session);
  const payload = {
    availability_slots: [
      { day_of_week: 1, starts_at: '18:00:00', ends_at: '23:59:00' },
    ],
    display_name: displayName,
    handle: displayName,
    habits: snapshot.habits,
    heroes: snapshot.heroIds.map((heroId) => {
      const hero = HEROES.find((item) => item.id === heroId);
      return {
        slug: dbSlug(heroId),
        name: hero?.name ?? heroId,
        role_slug: roleSlug(hero?.role),
      };
    }),
    languages: ['vi'],
    locale: 'vi',
    media_summary: {
      avatar: snapshot.mediaDraft.avatar,
      cover: snapshot.mediaDraft.cover,
      wall_count: snapshot.mediaDraft.wallCount,
    },
    rank_slug: dbSlug(snapshot.rankId),
    regions: ['global'],
    role_slugs: snapshot.laneIds.map(dbSlug),
    timezone: safeTimezone(),
  };

  const result = await supabaseRest<{ completed: boolean }[]>(
    'rpc/complete_onboarding',
    { body: { payload }, method: 'POST', session },
  );

  return Boolean(result?.[0]?.completed);
}

type OnboardingCompletionRow = Pick<Tables<'profile_habits'>, 'profile_id'>;

export async function hasCompletedOnboarding(session: AuthSession) {
  // `complete_onboarding` writes profile_habits last after the required
  // profile, game profile, role, hero, availability, and preference records.
  // A row here is therefore the smallest stable client-readable completion
  // marker for post-login routing.
  const rows = await supabaseRest<OnboardingCompletionRow[]>(
    `profile_habits?select=profile_id&profile_id=eq.${session.user.id}&limit=1`,
    { session },
  );

  return rows.length > 0;
}

function roleSlug(role: string | undefined) {
  if (role === 'Đấu sĩ') return 'fighter';
  if (role === 'Đỡ đòn') return 'tank';
  if (role === 'Pháp sư') return 'mage';
  if (role === 'Sát thủ') return 'assassin';
  if (role === 'Trợ thủ') return 'support';
  if (role === 'Xạ thủ') return 'marksman';
  return 'mage';
}

function displayNameFromSession(session: AuthSession) {
  const metadata = session.user.user_metadata ?? {};
  const rawName =
    stringValue(metadata.full_name) ??
    stringValue(metadata.name) ??
    stringValue(metadata.display_name) ??
    session.user.email?.split('@')[0] ??
    'Liqi Player';
  const name = rawName.replace(/[._-]+/g, ' ').trim();
  return (name.length < 2 ? 'Liqi Player' : name).slice(0, 40);
}

function safeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
