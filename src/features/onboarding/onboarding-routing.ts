import type { AuthSession } from '@/shared/auth/auth-service';

import { hasCompletedOnboarding } from '@/features/onboarding/profile-service';

export type PostLoginRoute = '/home' | '/profile-setup';

export const ONBOARDING_STATUS_UNAVAILABLE_MESSAGE =
  'Không thể kiểm tra trạng thái hồ sơ. Vui lòng kiểm tra mạng và thử lại.';

type CompletionChecker = (session: AuthSession) => Promise<boolean>;

export async function resolvePostLoginRoute(
  session: AuthSession,
  checkCompleted: CompletionChecker = hasCompletedOnboarding,
): Promise<PostLoginRoute> {
  return (await checkCompleted(session)) ? '/home' : '/profile-setup';
}
