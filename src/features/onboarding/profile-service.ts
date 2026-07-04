import { HEROES } from '@/features/onboarding/hero-selection-data';
import { dbSlug, type OnboardingSnapshot } from '@/features/onboarding/onboarding-store';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

export async function completeOnboardingProfile(
  session: AuthSession,
  snapshot: OnboardingSnapshot,
) {
  const payload = {
    availability_slots: [{ day_of_week: 1, starts_at: '18:00:00', ends_at: '23:59:00' }],
    display_name: session.user.email?.split('@')[0] ?? 'Liqi Player',
    handle: session.user.email?.split('@')[0] ?? 'Liqi Player',
    habits: snapshot.habits,
    heroes: snapshot.heroIds.map((heroId) => {
      const hero = HEROES.find((item) => item.id === heroId);
      return { slug: dbSlug(heroId), name: hero?.name ?? heroId, role_slug: 'mage' };
    }),
    languages: ['vi'],
    locale: 'vi',
    media_summary: snapshot.mediaDraft,
    rank_slug: dbSlug(snapshot.rankId),
    regions: ['global'],
    role_slugs: snapshot.laneIds.map(dbSlug),
    timezone: 'UTC',
  };

  const result = await supabaseRest<Array<{ completed: boolean }>>(
    'rpc/complete_onboarding',
    { body: { payload }, method: 'POST', session },
  );

  return Boolean(result?.[0]?.completed);
}

export async function hasCompletedOnboarding(session: AuthSession) {
  const rows = await supabaseRest<Array<{ profile_id: string }>>(
    `profile_habits?select=profile_id&profile_id=eq.${session.user.id}&limit=1`,
    { session },
  );

  return rows.length > 0;
}
