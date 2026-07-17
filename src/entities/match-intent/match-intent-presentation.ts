import type {
  MatchIntentFiltersV1,
  MatchIntentSnapshotV1,
} from '@/shared/contracts/core-v1';

export type MatchIntentMoodId =
  'setlove' | 'rank' | 'team' | 'normal' | 'soulmate';

const moodFilters: Readonly<
  Record<MatchIntentMoodId, Omit<MatchIntentFiltersV1, 'timezone'>>
> = {
  normal: {
    intentKind: 'normal',
    mode: 'normal',
    partyFormat: 'flex',
    roleSlugs: [],
    sessionPlan: 'quick',
  },
  rank: {
    intentKind: 'rank',
    mode: 'ranked',
    partyFormat: 'duo',
    roleSlugs: [],
    sessionPlan: 'quick',
  },
  setlove: {
    intentKind: 'set_love',
    mode: 'normal',
    partyFormat: 'flex',
    roleSlugs: [],
    sessionPlan: 'long',
  },
  soulmate: {
    intentKind: 'soulmate',
    mode: 'normal',
    partyFormat: 'duo',
    roleSlugs: [],
    sessionPlan: 'long',
  },
  team: {
    intentKind: 'team_rank',
    mode: 'ranked',
    partyFormat: 'full_team',
    roleSlugs: [],
    sessionPlan: 'long',
  },
};

export function matchIntentFiltersForMood(
  moodId: MatchIntentMoodId,
  timezone = resolveMatchIntentTimezone(),
): MatchIntentFiltersV1 {
  return { ...moodFilters[moodId], timezone };
}

export function moodForMatchIntent(
  snapshot: MatchIntentSnapshotV1 | null | undefined,
): MatchIntentMoodId | null {
  const kind = snapshot?.filters.intentKind;
  if (kind === 'set_love') return 'setlove';
  if (kind === 'team_rank') return 'team';
  if (kind === 'soulmate') return 'soulmate';
  if (kind === 'rank') return 'rank';
  if (kind === 'normal') return 'normal';

  if (snapshot?.filters.mode === 'ranked') return 'rank';
  return snapshot ? 'normal' : null;
}

export function isMatchIntentActive(
  snapshot: MatchIntentSnapshotV1 | null | undefined,
  now = Date.now(),
) {
  if (!snapshot || snapshot.state !== 'active') return false;
  if (!snapshot.expiresAt) return true;
  const expiresAt = Date.parse(snapshot.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function resolveMatchIntentTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
  } catch {
    return 'Asia/Bangkok';
  }
}
