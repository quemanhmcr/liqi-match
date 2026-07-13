import type { HabitPayload } from '../habit-options';
import {
  getPersistedOnboardingDraft,
  patchPersistedOnboardingDraftData,
  type ProfileGender,
} from './persisted-onboarding-draft';

export type { ProfileGender } from './persisted-onboarding-draft';

export type ProfileBasics = {
  displayName: string;
  gender?: ProfileGender;
};

export type OnboardingSnapshot = {
  habits: HabitPayload | null;
  heroIds: string[];
  laneIds: string[];
  mediaDraft: { avatar: boolean; cover: boolean; wallCount: number };
  profileBasics: ProfileBasics;
  rankId: string;
};

let legacyMediaDraft = { avatar: false, cover: false, wallCount: 0 };

/**
 * Transitional compatibility for the media completion screen. Core onboarding
 * screens now write only to the persisted account-scoped draft.
 */
export function getOnboardingSnapshot(): OnboardingSnapshot {
  try {
    const data = getPersistedOnboardingDraft().data;
    return {
      habits: data.habits ?? null,
      heroIds: data.heroIds ?? [],
      laneIds: data.laneIds ?? [],
      mediaDraft: legacyMediaDraft,
      profileBasics: {
        displayName: data.profileBasics?.displayName ?? '',
        gender: data.profileBasics?.gender,
      },
      rankId: data.rankId ?? '',
    };
  } catch {
    return emptySnapshot();
  }
}

export function updateOnboardingSnapshot(patch: Partial<OnboardingSnapshot>) {
  if (patch.mediaDraft) legacyMediaDraft = patch.mediaDraft;

  const corePatch = {
    habits: patch.habits ?? undefined,
    heroIds: patch.heroIds,
    laneIds: patch.laneIds,
    profileBasics: patch.profileBasics,
    rankId: patch.rankId,
  };
  if (Object.values(corePatch).some((value) => value !== undefined)) {
    void patchPersistedOnboardingDraftData(corePatch);
  }
}

export function resetOnboardingSnapshot() {
  legacyMediaDraft = { avatar: false, cover: false, wallCount: 0 };
}

export function dbSlug(value: string) {
  return value.replace(/-/g, '_');
}

function emptySnapshot(): OnboardingSnapshot {
  return {
    habits: null,
    heroIds: [],
    laneIds: [],
    mediaDraft: legacyMediaDraft,
    profileBasics: { displayName: '' },
    rankId: '',
  };
}
