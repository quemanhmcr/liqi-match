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
  if (!data.profileBasics?.gender) return 'profile_setup';
  if (!data.rankId) return 'rank';
  if (!data.laneIds || data.laneIds.length < 1 || data.laneIds.length > 2) {
    return 'lane';
  }
  if (!data.heroIds || data.heroIds.length !== 3) return 'hero_selection';
  if (!hasCompleteHabits(data)) return 'habits';
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
  return findFirstIncompleteStep(data) === 'profile_media';
}

function hasCompleteHabits(data: OnboardingDraftData) {
  const habits = data.habits;
  return Boolean(
    habits &&
    habits.communication_channels.length > 0 &&
    habits.online_time_presets.length > 0 &&
    habits.decision_style &&
    habits.session_length &&
    habits.team_goals.length > 0 &&
    habits.seriousness &&
    habits.strategy_styles.length > 0 &&
    habits.team_atmospheres.length > 0 &&
    habits.feedback_style &&
    habits.loss_response &&
    habits.comeback_response,
  );
}

function stepIndex(step: OnboardingStep) {
  return ONBOARDING_STEPS.indexOf(step);
}
