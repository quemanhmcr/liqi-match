export type AccessArea = 'app' | 'onboarding' | 'public';
export type AccessDecision = 'allow' | 'to-home' | 'to-login' | 'to-onboarding';

export type AccessSnapshot = {
  area: AccessArea;
  hasCompletedOnboarding?: boolean;
  hasSession: boolean;
};

/** Pure, testable access policy. Network and rendering live outside this file. */
export function resolveAccess({
  area,
  hasCompletedOnboarding,
  hasSession,
}: AccessSnapshot): AccessDecision {
  if (area === 'public') return hasSession ? 'to-home' : 'allow';
  if (!hasSession) return 'to-login';

  if (area === 'onboarding') {
    return hasCompletedOnboarding ? 'to-home' : 'allow';
  }

  return hasCompletedOnboarding ? 'allow' : 'to-onboarding';
}
