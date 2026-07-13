import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  FEEDBACK_STYLE_CATALOG,
  HabitAnswersDraftSchema,
  LOSS_RESPONSE_CATALOG,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  TIME_PREFERENCE_CATALOG,
  legacyValueForCatalogId,
  type HabitAnswersDraft,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { ProfileEditCommandError } from './profile-edit-command-error';
import { stableKey } from './profile-edit-command-utils';

export async function saveProfileHabits(input: {
  baseline: HabitAnswersDraft;
  current: HabitAnswersDraft;
  habitsLossless: boolean;
  hasHabitRecord: boolean;
  profileId: string;
  session: AuthSession;
}) {
  if (!input.hasHabitRecord) {
    throw new ProfileEditCommandError(
      'Chưa có câu trả lời thói quen để cập nhật. Profile Edit sẽ không tạo completion marker hoặc đáp án giả.',
    );
  }
  if (!input.habitsLossless) {
    throw new ProfileEditCommandError(
      'Habit legacy chưa resolve losslessly. Hãy xử lý giá trị unsupported trước khi lưu habits.',
    );
  }

  const baseline = HabitAnswersDraftSchema.parse(input.baseline);
  const current = HabitAnswersDraftSchema.parse(input.current);
  const patch: Record<string, unknown> = {};

  setIfChanged(
    patch,
    'comeback_response',
    baseline.comebackResponseId,
    current.comebackResponseId,
    (id) =>
      requiredLegacyValue(COMEBACK_RESPONSE_CATALOG, id, 'comebackResponseId'),
  );
  setIfChanged(
    patch,
    'communication_channels',
    baseline.communicationPreferenceIds,
    current.communicationPreferenceIds,
    (ids) =>
      ids.map((id) =>
        legacyValueForCatalogId(COMMUNICATION_PREFERENCE_CATALOG, id),
      ),
  );
  setIfChanged(
    patch,
    'decision_style',
    baseline.decisionStyleId,
    current.decisionStyleId,
    (id) => requiredLegacyValue(DECISION_STYLE_CATALOG, id, 'decisionStyleId'),
  );
  setIfChanged(
    patch,
    'feedback_style',
    baseline.feedbackStyleId,
    current.feedbackStyleId,
    (id) => requiredLegacyValue(FEEDBACK_STYLE_CATALOG, id, 'feedbackStyleId'),
  );
  setIfChanged(
    patch,
    'loss_response',
    baseline.lossResponseId,
    current.lossResponseId,
    (id) => requiredLegacyValue(LOSS_RESPONSE_CATALOG, id, 'lossResponseId'),
  );
  setIfChanged(
    patch,
    'online_time_presets',
    baseline.timePreferenceIds,
    current.timePreferenceIds,
    (ids) =>
      ids.map((id) => legacyValueForCatalogId(TIME_PREFERENCE_CATALOG, id)),
  );
  setIfChanged(
    patch,
    'seriousness',
    baseline.seriousnessId,
    current.seriousnessId,
    (id) => requiredLegacyValue(SERIOUSNESS_CATALOG, id, 'seriousnessId'),
  );
  setIfChanged(
    patch,
    'session_length',
    baseline.sessionLengthId,
    current.sessionLengthId,
    (id) => requiredLegacyValue(SESSION_LENGTH_CATALOG, id, 'sessionLengthId'),
  );
  setIfChanged(
    patch,
    'strategy_styles',
    baseline.strategyStyleIds,
    current.strategyStyleIds,
    (ids) =>
      ids.map((id) => legacyValueForCatalogId(STRATEGY_STYLE_CATALOG, id)),
  );
  setIfChanged(
    patch,
    'team_atmospheres',
    baseline.teamAtmosphereIds,
    current.teamAtmosphereIds,
    (ids) =>
      ids.map((id) => legacyValueForCatalogId(TEAM_ATMOSPHERE_CATALOG, id)),
  );
  setIfChanged(
    patch,
    'team_goals',
    baseline.teamGoalIds,
    current.teamGoalIds,
    (ids) => ids.map((id) => legacyValueForCatalogId(TEAM_GOAL_CATALOG, id)),
  );

  if (!Object.keys(patch).length) return;
  await supabaseRest(
    `profile_habits?profile_id=eq.${encodeURIComponent(input.profileId)}`,
    {
      body: patch,
      method: 'PATCH',
      prefer: 'return=minimal',
      session: input.session,
    },
  );
}

function setIfChanged<T>(
  patch: Record<string, unknown>,
  backendKey: string,
  baseline: T,
  current: T,
  map: (value: T) => unknown,
) {
  if (stableKey(baseline) !== stableKey(current)) {
    patch[backendKey] = map(current);
  }
}

function requiredLegacyValue<
  const Options extends readonly {
    id: string;
    label: string;
    legacyValue: string;
  }[],
>(options: Options, id: Options[number]['id'] | null, path: string) {
  if (id === null) {
    throw new ProfileEditCommandError(
      `${path} chưa có câu trả lời; Profile Edit không ghi giá trị giả.`,
    );
  }
  return legacyValueForCatalogId(options, id);
}
