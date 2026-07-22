import { describe, expect, it } from '@jest/globals';

import {
  createEmptyHabitAnswers,
  type HabitAnswersDraft,
} from '@/entities/player-profile';
import { PlayerTrustProjectionV2Schema } from '@/shared/contracts/core-v2';

import { presentProfilePlayStyleHabits } from '../model/profile-play-style-presenter';
import {
  presentProfileHeroTags,
  presentProfileSocialStats,
  presentTrustSummary,
  profileMetaLine,
} from '../model/profile-surface-presenter';

describe('Profile surface presenter', () => {
  it('uses gender in hero metadata and presents authoritative extra tags', () => {
    expect(
      profileMetaLine({
        gender: 'female',
        rankName: 'Cao Thủ',
        roleNames: ['Trợ Thủ'],
      }),
    ).toBe('Cao Thủ · Trợ Thủ · Nữ');
    expect(
      profileMetaLine({
        gender: 'hidden',
        rankName: 'Cao Thủ',
        roleNames: ['Trợ Thủ'],
      }),
    ).toBe('Cao Thủ · Trợ Thủ');

    expect(
      presentProfileHeroTags({
        availability: {
          slots: [
            { dayOfWeek: 1, endMinute: 1380, startMinute: 1140 },
            { dayOfWeek: 3, endMinute: 1380, startMinute: 1140 },
            { dayOfWeek: 5, endMinute: 1440, startMinute: 1140 },
          ],
          timezone: 'Asia/Ho_Chi_Minh',
        },
        favoriteHeroes: [{ name: 'Aya' }],
        playStyleTags: ['Cạnh tranh'],
      }),
    ).toEqual({
      availability: 'T2, T4, T6 · Tối',
      favoriteHero: 'Aya',
      playStyle: 'Cạnh tranh',
    });
  });

  it('resolves three explainable facets from canonical habit IDs', () => {
    const habits: HabitAnswersDraft = {
      ...createEmptyHabitAnswers(),
      communicationPreferenceIds: ['communication.voice-proactive'],
      decisionStyleId: 'decision.discuss',
      strategyStyleIds: ['strategy.protect', 'strategy.objectives'] as const,
      teamAtmosphereIds: ['atmosphere.analytical'],
      teamGoalIds: ['goal.stable-teamwork', 'goal.rank-climb'] as const,
    };
    const tiles = presentProfilePlayStyleHabits(habits);

    expect(tiles.map((tile) => tile.slot)).toEqual([
      'goal',
      'coordination',
      'tactics',
    ]);
    expect(tiles.map((tile) => tile.label)).toEqual([
      'MỤC TIÊU',
      'PHỐI HỢP',
      'CHIẾN THUẬT',
    ]);
    expect(tiles.map((tile) => tile.archetypeId)).toEqual([
      'goal.rank-climb',
      'coordination.analytical',
      'tactics.objective-control',
    ]);
    expect(tiles.map((tile) => tile.title)).toEqual([
      'Leo rank nghiêm túc',
      'Cùng phân tích',
      'Kiểm soát bản đồ',
    ]);
    expect(tiles[0]?.sourceHabitIds).toEqual(['goal.rank-climb']);
    expect(tiles[0]?.sourceLabels).toEqual(['Leo rank nghiêm túc']);
    expect(tiles[1]?.sourceHabitIds).toEqual(['decision.discuss']);
    expect(tiles[1]?.sourceLabels).toEqual([
      'Cùng trao đổi trước khi quyết định',
    ]);
    expect(tiles[2]?.sourceHabitIds).toEqual(['strategy.objectives']);
    expect(tiles.every((tile) => tile.mode === 'auto')).toBe(true);
  });

  it('keeps archetype selection stable when multi-select input order changes', () => {
    const baseline: HabitAnswersDraft = {
      ...createEmptyHabitAnswers(),
      strategyStyleIds: ['strategy.protect', 'strategy.objectives'] as const,
      teamGoalIds: ['goal.stable-teamwork', 'goal.rank-climb'] as const,
    };
    const reversed = {
      ...baseline,
      strategyStyleIds: [...baseline.strategyStyleIds].reverse(),
      teamGoalIds: [...baseline.teamGoalIds].reverse(),
    };

    expect(
      presentProfilePlayStyleHabits(baseline).map((tile) => ({
        archetypeId: tile.archetypeId,
        sourceHabitIds: tile.sourceHabitIds,
      })),
    ).toEqual(
      presentProfilePlayStyleHabits(reversed).map((tile) => ({
        archetypeId: tile.archetypeId,
        sourceHabitIds: tile.sourceHabitIds,
      })),
    );
  });

  it('keeps all three cards but fails closed when canonical habits are absent', () => {
    const tiles = presentProfilePlayStyleHabits();

    expect(tiles).toHaveLength(3);
    expect(tiles.map((tile) => tile.archetypeId)).toEqual([null, null, null]);
    expect(tiles.map((tile) => tile.title)).toEqual([
      'Chưa chọn mục tiêu',
      'Chưa chọn phối hợp',
      'Chưa chọn chiến thuật',
    ]);
    expect(tiles.every((tile) => tile.mode === 'empty')).toBe(true);
    expect(tiles.every((tile) => tile.sourceHabitIds.length === 0)).toBe(true);
  });

  it('describes unavailable trust without inventing evidence', () => {
    const summary = presentTrustSummary();

    expect(summary.body).toBe('Dữ liệu uy tín đã xác minh hiện chưa khả dụng.');
    expect(summary.meta).toBe('Nguồn dữ liệu chưa khả dụng');
    expect(summary.reliabilityLabel).toBe('Chưa đủ dữ liệu uy tín');
    expect(summary.endorsementLabel).toBe('Chưa tải lời khen xác minh');
  });

  it('keeps authoritative endorsement and reliability evidence separate', () => {
    const projection = PlayerTrustProjectionV2Schema.parse({
      completedSessions: 7,
      completionReliabilityBps: 8750,
      confirmedModerationActions: 0,
      noShowCount: 1,
      playerId: '20000000-0000-4000-8000-000000000002',
      positiveEndorsements: 12,
      projectionVersion: 20,
      rebuiltAt: null,
      repeatTeammateCount: 3,
      updatedAt: '2026-07-14T16:00:00.000Z',
    });
    const summary = presentTrustSummary(projection);

    expect(summary.body).toBe(
      'Các chỉ số dưới đây được tổng hợp từ hoạt động đã xác minh trên LiQi.',
    );
    expect(summary.reliabilityLabel).toBe('88% độ tin cậy');
    expect(summary.endorsementLabel).toBe('12 lời khen xác minh');
    expect(summary.meta).toBe('Nguồn: hoạt động đã xác minh trên LiQi');
  });

  it('does not turn an empty trust projection into negative proof', () => {
    const projection = PlayerTrustProjectionV2Schema.parse({
      completedSessions: 0,
      completionReliabilityBps: 0,
      confirmedModerationActions: 0,
      noShowCount: 0,
      playerId: '20000000-0000-4000-8000-000000000002',
      positiveEndorsements: 0,
      projectionVersion: 1,
      rebuiltAt: null,
      repeatTeammateCount: 0,
      updatedAt: '2026-07-14T16:00:00.000Z',
    });
    const summary = presentTrustSummary(projection);

    expect(summary.body).toBe(
      'Chưa đủ hoạt động đã xác minh để hình thành tín hiệu uy tín.',
    );
    expect(summary.reliabilityLabel).toBe('Chưa đủ dữ liệu uy tín');
    expect(summary.endorsementLabel).toBe('Chưa có lời khen xác minh');
  });

  it('formats the future social projection without falling back to trust data', () => {
    expect(
      presentProfileSocialStats({
        completedSessionCount: 48,
        likeCount: 1284,
        matchCount: 96,
      }),
    ).toEqual([
      { label: 'Lượt thích', value: '1,3K' },
      { label: 'Đã match', value: '96' },
      { label: 'Đã chơi', value: '48' },
    ]);
    expect(presentProfileSocialStats().map((item) => item.value)).toEqual([
      '—',
      '—',
      '—',
    ]);
  });
});
