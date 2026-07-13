import { describe, expect, it } from '@jest/globals';

import { createEmptyHabitAnswers } from '../schemas';
import { adaptLegacyHabitAnswers } from '../legacy-habit-adapter';

const completeLegacyHabits = {
  comeback_response: 'Theo quyết định chung của đội',
  communication_channels: ['Voice khi cần', 'Ping/chat là chính'],
  decision_style: 'Cùng trao đổi trước khi quyết định',
  feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
  loss_response: 'Nghỉ 5-15 phút',
  online_time_presets: ['Tối', 'Khuya'],
  seriousness: 'Cân bằng',
  session_length: '3-5 trận',
  strategy_styles: ['Ưu tiên kiểm soát mục tiêu'],
  team_atmospheres: ['Nghiêm túc nhưng tôn trọng'],
  team_goals: ['Leo rank nghiêm túc'],
};

describe('legacy habit compatibility adapter', () => {
  it('keeps a missing habit row explicitly unanswered', () => {
    expect(adaptLegacyHabitAnswers(null)).toEqual({
      issues: [],
      lossless: true,
      value: createEmptyHabitAnswers(),
    });
  });

  it('maps exact backend values and already-canonical IDs', () => {
    const result = adaptLegacyHabitAnswers({
      ...completeLegacyHabits,
      communication_channels: ['Voice khi cần', 'communication.text-ping'],
      seriousness: 'seriousness.balanced',
    });

    expect(result.lossless).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.value).toMatchObject({
      communicationPreferenceIds: [
        'communication.voice-as-needed',
        'communication.text-ping',
      ],
      seriousnessId: 'seriousness.balanced',
      teamGoalIds: ['goal.rank-climb'],
      timePreferenceIds: ['time.evening', 'time.late-night'],
    });
  });

  it('returns unknown values as errors without guessing a canonical ID', () => {
    const result = adaptLegacyHabitAnswers({
      seriousness: 'Siêu try-hard',
      team_goals: ['Leo rank nghiêm túc', 'Tự chế mục tiêu'],
    });

    expect(result.lossless).toBe(false);
    expect(result.value.seriousnessId).toBeNull();
    expect(result.value.teamGoalIds).toEqual(['goal.rank-climb']);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_legacy_value',
          path: 'seriousnessId',
          value: 'Siêu try-hard',
        }),
        expect.objectContaining({
          code: 'unknown_legacy_value',
          path: 'teamGoalIds.1',
          value: 'Tự chế mục tiêu',
        }),
      ]),
    );
  });

  it('deduplicates exact values with a warning while preserving first order', () => {
    const result = adaptLegacyHabitAnswers({
      communication_channels: [
        'Voice khi cần',
        'Voice khi cần',
        'Ping/chat là chính',
      ],
    });

    expect(result.lossless).toBe(true);
    expect(result.value.communicationPreferenceIds).toEqual([
      'communication.voice-as-needed',
      'communication.text-ping',
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'duplicate_legacy_value',
        path: 'communicationPreferenceIds.1',
      }),
    ]);
  });

  it('reports over-limit selections instead of silently truncating them', () => {
    const result = adaptLegacyHabitAnswers({
      team_goals: [
        'Leo rank nghiêm túc',
        'Tìm duo lâu dài',
        'Chơi vui, thư giãn',
      ],
    });

    expect(result.lossless).toBe(false);
    expect(result.value.teamGoalIds).toEqual([
      'goal.rank-climb',
      'goal.long-term-duo',
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'legacy_value_limit_exceeded',
        path: 'teamGoalIds.2',
        value: 'Chơi vui, thư giãn',
      }),
    ]);
  });

  it('reports malformed scalar and list shapes independently', () => {
    const result = adaptLegacyHabitAnswers({
      decision_style: ['Cùng trao đổi trước khi quyết định'],
      team_goals: 'Leo rank nghiêm túc',
    });

    expect(result.lossless).toBe(false);
    expect(result.value.decisionStyleId).toBeNull();
    expect(result.value.teamGoalIds).toEqual([]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_legacy_value_shape',
          path: 'decisionStyleId',
        }),
        expect.objectContaining({
          code: 'invalid_legacy_value_shape',
          path: 'teamGoalIds',
        }),
      ]),
    );
  });
});
