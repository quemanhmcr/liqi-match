import {
  adaptCompletedProfileToLegacyOnboardingPayload,
  type LegacyProfileAdapterIssue,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { OnboardingDraftData } from '../model/persisted-onboarding-draft';

export type CompleteOnboardingProfileResult = {
  completed: boolean;
  warnings: LegacyProfileAdapterIssue[];
};

/** The canonical adapter is the only boundary allowed to create the legacy RPC payload. */
export async function completeOnboardingProfile(
  session: AuthSession,
  draft: OnboardingDraftData,
): Promise<CompleteOnboardingProfileResult> {
  const adapted = adaptCompletedProfileToLegacyOnboardingPayload(draft.profile);
  if (!adapted.ok) {
    const message = adapted.errors
      .map((issue) => `${issue.path || 'profile'}: ${issue.message}`)
      .join('\n');
    throw new Error(message || 'Dữ liệu onboarding canonical chưa hoàn tất.');
  }

  const result = await supabaseRest<{ completed: boolean }[]>(
    'rpc/complete_onboarding',
    { body: { payload: adapted.payload }, method: 'POST', session },
  );

  return {
    completed: Boolean(result?.[0]?.completed),
    warnings: [...adapted.warnings],
  };
}
