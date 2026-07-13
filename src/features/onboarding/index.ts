/** Lightweight cross-layer API; route screens are imported from screens/. */
export { completeOnboardingProfile } from './services/onboarding-profile-service';
export {
  clearActivePersistedOnboardingDraft,
  hydratePersistedOnboardingDraft,
  onboardingDraftStorageKey,
  ONBOARDING_DRAFT_VERSION,
  usePersistedOnboardingDraftStore,
  type OnboardingDraftEnvelope,
  type OnboardingStep,
} from './model/persisted-onboarding-draft';
export { recoverInterruptedOnboardingMediaQueue } from './model/onboarding-media-queue';
export {
  onboardingStepFromPathname,
  resolveOnboardingStepAccess,
} from './model/onboarding-step-access';

export {
  createOnboardingSimulationResetParticipant,
  type OnboardingDraftPort,
} from './runtime/onboarding-simulation-reset';
