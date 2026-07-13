import { HEROES } from '@/entities/hero';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { OnboardingDraftData } from '../model/persisted-onboarding-draft';
import { hasCompleteOnboardingDraft } from '../model/onboarding-step-access';
import { buildRecurringAvailabilitySlots } from '../model/availability-slots';

/** Existing RPC boundary using the feature-local draft until shared contracts land. */
export async function completeOnboardingProfile(
  session: AuthSession,
  draft: OnboardingDraftData,
) {
  if (!hasCompleteOnboardingDraft(draft)) {
    throw new Error(
      'Dữ liệu onboarding chưa đầy đủ. Hãy kiểm tra lại các bước trước.',
    );
  }

  const basics = requireProfileBasics(draft);
  const rankId = requireString(draft.rankId, 'Bạn chưa chọn rank.');
  const laneIds = requireArray(draft.laneIds, 'Bạn chưa chọn lane.');
  const heroIds = requireArray(draft.heroIds, 'Bạn chưa chọn đủ tướng.');
  const habits = requireHabits(draft);
  const displayName =
    displayNameFromDraft(draft) ?? displayNameFromSession(session);
  const availabilitySlots = buildRecurringAvailabilitySlots(
    habits.online_time_presets,
  );

  if (!availabilitySlots.length) {
    throw new Error('Chọn ít nhất một khung giờ online trước khi hoàn tất.');
  }

  const payload = {
    availability_slots: availabilitySlots,
    display_name: displayName,
    handle: displayName,
    habits,
    heroes: heroIds.map((heroId) => {
      const hero = HEROES.find((item) => item.id === heroId);
      return {
        name: hero?.name ?? heroId,
        role_slug: roleSlug(hero?.role),
        slug: dbSlug(heroId),
      };
    }),
    languages: ['vi'],
    locale: 'vi',
    // The current RPC stores gender in this legacy JSON column. Do not put
    // selected/uploading media here: media completion is tracked separately.
    media_summary: { profile_basics: { gender: basics.gender } },
    profile_basics: { gender: basics.gender },
    rank_slug: dbSlug(rankId),
    regions: ['global'],
    role_slugs: laneIds.map(dbSlug),
    timezone: safeTimezone(),
  };

  const result = await supabaseRest<{ completed: boolean }[]>(
    'rpc/complete_onboarding',
    { body: { payload }, method: 'POST', session },
  );

  return Boolean(result?.[0]?.completed);
}

function requireProfileBasics(draft: OnboardingDraftData) {
  if (!draft.profileBasics?.gender) {
    throw new Error('Bạn chưa chọn giới tính.');
  }
  return draft.profileBasics;
}

function requireHabits(draft: OnboardingDraftData) {
  if (!draft.habits) {
    throw new Error(
      'Dữ liệu thói quen chưa hoàn tất. Vui lòng quay lại bước 5.',
    );
  }
  return draft.habits;
}

function requireString(value: string | undefined, message: string) {
  if (!value) throw new Error(message);
  return value;
}

function requireArray(value: string[] | undefined, message: string) {
  if (!value?.length) throw new Error(message);
  return value;
}

function dbSlug(value: string) {
  return value.replace(/-/g, '_');
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

function displayNameFromDraft(draft: OnboardingDraftData) {
  const name = draft.profileBasics?.displayName?.replace(/[._-]+/g, ' ').trim();
  if (!name || name.length < 2) return undefined;
  return name.slice(0, 20);
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
