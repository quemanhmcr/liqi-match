import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { ProfileEditHabitAnswers } from '../../model/profile-edit-model';
import { ProfileEditCommandError } from './profile-edit-command-error';
import { compactUnique, stableKey } from './profile-edit-command-utils';

const habitKeys = [
  'comeback_response',
  'communication_channels',
  'decision_style',
  'feedback_style',
  'loss_response',
  'seriousness',
  'session_length',
  'strategy_styles',
  'team_atmospheres',
  'team_goals',
] as const satisfies readonly (keyof ProfileEditHabitAnswers)[];

export async function saveProfileHabits(input: {
  baseline: ProfileEditHabitAnswers;
  current: ProfileEditHabitAnswers;
  hasHabitRecord: boolean;
  profileId: string;
  session: AuthSession;
}) {
  if (!input.hasHabitRecord) {
    throw new ProfileEditCommandError(
      'Chưa có câu trả lời thói quen để cập nhật. Profile Edit sẽ không tạo completion marker hoặc đáp án giả.',
    );
  }

  const patch: Record<string, unknown> = {};
  for (const key of habitKeys) {
    if (stableKey(input.baseline[key]) === stableKey(input.current[key])) {
      continue;
    }
    patch[key] = normalizeHabitValue(key, input.current[key]);
  }
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

function normalizeHabitValue(
  key: (typeof habitKeys)[number],
  value: ProfileEditHabitAnswers[(typeof habitKeys)[number]],
) {
  if (Array.isArray(value)) {
    const limits: Partial<Record<(typeof habitKeys)[number], number>> = {
      communication_channels: 2,
      strategy_styles: 3,
      team_atmospheres: 2,
      team_goals: 2,
    };
    return compactUnique(value, limits[key] ?? 10);
  }
  return typeof value === 'string' ? value.trim() : '';
}
