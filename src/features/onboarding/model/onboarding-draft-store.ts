import { create } from 'zustand';

export type ProfileGender = 'male' | 'female' | 'hidden';

export type ProfileBasics = {
  displayName: string;
  gender: ProfileGender;
};

export type OnboardingSnapshot = {
  profileBasics: ProfileBasics;
  rankId: string;
  laneIds: string[];
  heroIds: string[];
  habits: Record<string, unknown>;
  mediaDraft: { avatar: boolean; cover: boolean; wallCount: number };
};

function createInitialSnapshot(): OnboardingSnapshot {
  return {
    profileBasics: { displayName: '', gender: 'male' },
    rankId: 'master',
    laneIds: ['jungle'],
    heroIds: ['edras', 'goverra', 'heino'],
    habits: {},
    mediaDraft: { avatar: false, cover: false, wallCount: 0 },
  };
}

type OnboardingDraftState = {
  reset: () => void;
  snapshot: OnboardingSnapshot;
  update: (patch: Partial<OnboardingSnapshot>) => void;
};

const useOnboardingDraftStore = create<OnboardingDraftState>((set) => ({
  reset: () => set({ snapshot: createInitialSnapshot() }),
  snapshot: createInitialSnapshot(),
  update: (patch) =>
    set((state) => ({ snapshot: { ...state.snapshot, ...patch } })),
}));

/** Imperative API keeps individual step screens independent of store plumbing. */
export function updateOnboardingSnapshot(patch: Partial<OnboardingSnapshot>) {
  useOnboardingDraftStore.getState().update(patch);
}

export function getOnboardingSnapshot(): OnboardingSnapshot {
  return useOnboardingDraftStore.getState().snapshot;
}

export function resetOnboardingSnapshot() {
  useOnboardingDraftStore.getState().reset();
}

export function dbSlug(value: string) {
  return value.replace(/-/g, '_');
}
