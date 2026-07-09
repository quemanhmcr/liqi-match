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

let onboardingSnapshot: OnboardingSnapshot = {
  profileBasics: { displayName: '', gender: 'male' },
  rankId: 'master',
  laneIds: ['jungle'],
  heroIds: ['edras', 'goverra', 'heino'],
  habits: {},
  mediaDraft: { avatar: false, cover: false, wallCount: 0 },
};

export function updateOnboardingSnapshot(patch: Partial<OnboardingSnapshot>) {
  onboardingSnapshot = { ...onboardingSnapshot, ...patch };
}

export function getOnboardingSnapshot(): OnboardingSnapshot {
  return onboardingSnapshot;
}

export function dbSlug(value: string) {
  return value.replace(/-/g, '_');
}
