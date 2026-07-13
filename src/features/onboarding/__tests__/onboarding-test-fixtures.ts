import {
  ONBOARDING_DRAFT_VERSION,
  type OnboardingDraftData,
  type OnboardingDraftEnvelope,
  type OnboardingStatus,
} from '../model/persisted-onboarding-draft';

export const testAccountId = '00000000-0000-0000-0000-000000000001';

export function completeOnboardingDraftData(): OnboardingDraftData {
  return {
    habits: {
      comeback_response: 'Theo quyết định chung của đội',
      communication_channels: ['Voice khi cần'],
      decision_style: 'Cùng trao đổi trước khi quyết định',
      feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
      loss_response: 'Nghỉ 5-15 phút',
      online_time_presets: ['Tối'],
      seriousness: 'Cân bằng',
      session_length: '3-5 trận',
      strategy_styles: ['Ưu tiên kiểm soát mục tiêu'],
      team_atmospheres: ['Nghiêm túc nhưng tôn trọng'],
      team_goals: ['Leo rank nghiêm túc'],
    },
    heroIds: ['edras', 'goverra', 'heino'],
    laneIds: ['jungle'],
    profileBasics: { displayName: 'Liqi Pro', gender: 'hidden' },
    rankId: 'master',
  };
}

export function onboardingEnvelope(
  input: {
    accountId?: string;
    data?: OnboardingDraftData;
    status?: OnboardingStatus;
  } = {},
): OnboardingDraftEnvelope {
  return {
    accountId: input.accountId ?? testAccountId,
    currentStep: 'profile_media',
    data: input.data ?? completeOnboardingDraftData(),
    status: input.status ?? 'in_progress',
    updatedAt: '2026-07-13T00:00:00.000Z',
    version: ONBOARDING_DRAFT_VERSION,
  };
}
