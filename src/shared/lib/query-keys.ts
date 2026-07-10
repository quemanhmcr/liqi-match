/** Shared cache-key contracts for state observed by more than one app layer. */
export const queryKeys = {
  onboardingCompletion: (profileId: string) =>
    ['onboarding-completion', profileId] as const,
};
