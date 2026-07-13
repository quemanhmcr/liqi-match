import {
  CompletedHabitAnswersSchema,
  CompletedProfileDraftSchema,
} from '@/entities/player-profile';

import type {
  OnboardingDraftData,
  OnboardingDraftEnvelope,
  OnboardingStep,
} from './persisted-onboarding-draft';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'profile_setup',
  'rank',
  'lane',
  'hero_selection',
  'habits',
  'profile_media',
];

export type OnboardingStepAccess = {
  canAccessMedia: boolean;
  canAccessRequestedStep: boolean;
  canLeaveOnboarding: boolean;
  currentStep: OnboardingStep;
  firstIncompleteStep: OnboardingStep | null;
  isDraftDataComplete: boolean;
  redirectTarget: OnboardingStep | 'home' | null;
};

export function resolveOnboardingStepAccess(input: {
  envelope: OnboardingDraftEnvelope;
  requestedStep?: OnboardingStep;
}): OnboardingStepAccess {
  const { envelope, requestedStep } = input;
  const firstIncompleteStep = findFirstIncompleteStep(envelope.data);
  const isDraftDataComplete = firstIncompleteStep === 'profile_media';
  const canAccessMedia =
    isDraftDataComplete || envelope.status === 'media_pending';
  const canLeaveOnboarding = envelope.status === 'completed';

  if (canLeaveOnboarding) {
    return {
      canAccessMedia,
      canAccessRequestedStep: false,
      canLeaveOnboarding: true,
      currentStep: envelope.currentStep,
      firstIncompleteStep,
      isDraftDataComplete,
      redirectTarget: 'home',
    };
  }

  if (envelope.status === 'media_pending') {
    return {
      canAccessMedia: true,
      canAccessRequestedStep: requestedStep === 'profile_media',
      canLeaveOnboarding: false,
      currentStep: 'profile_media',
      firstIncompleteStep,
      isDraftDataComplete,
      redirectTarget:
        requestedStep && requestedStep !== 'profile_media'
          ? 'profile_media'
          : null,
    };
  }

  const resumeStep = firstIncompleteStep ?? 'profile_media';
  const canAccessRequestedStep = requestedStep
    ? stepIndex(requestedStep) <= stepIndex(resumeStep)
    : true;

  return {
    canAccessMedia,
    canAccessRequestedStep,
    canLeaveOnboarding: false,
    currentStep: resumeStep,
    firstIncompleteStep,
    isDraftDataComplete,
    redirectTarget: canAccessRequestedStep ? null : resumeStep,
  };
}

export function findFirstIncompleteStep(
  data: OnboardingDraftData,
): OnboardingStep | null {
  const profile = data.profile;
  const basics = profile.profileBasics;
  if (
    basics.displayName.trim().length < 2 ||
    !basics.gameHandle ||
    basics.gameHandle.trim().length < 2 ||
    !basics.genderId
  ) {
    return 'profile_setup';
  }
  if (!profile.rankId) return 'rank';
  if (!profile.laneSelection) return 'lane';
  if (profile.favoriteHeroes.length !== 3) return 'hero_selection';
  if (
    !CompletedHabitAnswersSchema.safeParse(profile.habits).success ||
    !profile.timezone ||
    !profile.recurringAvailability ||
    profile.recurringAvailability.slots.length === 0
  ) {
    return 'habits';
  }
  return 'profile_media';
}

export function onboardingStepFromPathname(
  pathname: string,
): OnboardingStep | undefined {
  const normalized = pathname.split('?')[0]?.replace(/\/$/, '') || pathname;
  if (normalized.endsWith('/profile-setup')) return 'profile_setup';
  if (normalized.endsWith('/rank')) return 'rank';
  if (normalized.endsWith('/lane')) return 'lane';
  if (normalized.endsWith('/hero-selection')) return 'hero_selection';
  if (normalized.endsWith('/habits')) return 'habits';
  if (normalized.endsWith('/profile-media')) return 'profile_media';
  return undefined;
}

export function hasCompleteOnboardingDraft(data: OnboardingDraftData) {
  return CompletedProfileDraftSchema.safeParse(data.profile).success;
}

function stepIndex(step: OnboardingStep) {
  return ONBOARDING_STEPS.indexOf(step);
}
