import { describe, expect, it } from '@jest/globals';

import {
  buildMatchedSetTags,
  chatActionAccessibilityLabel,
  formatMatchedConnectionCount,
  homeReadyModeLabel,
  selectPrimaryHomeReadyModes,
  matchedSetKindLabel,
  matchedSetStatusLabel,
} from '@/features/home/model/home-dashboard-view-model';

describe('home dashboard view model', () => {
  it('uses one Vietnamese presentation vocabulary for modes and statuses', () => {
    expect(
      homeReadyModeLabel({
        accent: '#64E6FF',
        description: 'Chơi vui.',
        id: 'normal',
        label: 'Normal',
      }),
    ).toBe('Thường');
    expect(
      homeReadyModeLabel({
        accent: '#C679FF',
        description: 'Kết nối tình cảm.',
        id: 'setlove',
        label: 'Set Love',
      }),
    ).toBe('Set Love');
    expect(matchedSetKindLabel('Set Love')).toBe('Set Love');
    expect(matchedSetKindLabel('Team Rank')).toBe('Đội xếp hạng');
    expect(matchedSetStatusLabel('online')).toBe('Online');
  });

  it('keeps the dashboard decision rail to four fixed primary moods', () => {
    const modes = [
      {
        accent: '#C679FF',
        description: 'Set Love.',
        id: 'setlove',
        label: 'Set Love',
      },
      {
        accent: '#FF7AD9',
        description: 'Tri kỉ.',
        id: 'soulmate',
        label: 'Tri kỉ',
      },
      {
        accent: '#64E6FF',
        description: 'Thường.',
        id: 'normal',
        label: 'Normal',
      },
      { accent: '#5DFFB3', description: 'Rank.', id: 'rank', label: 'Rank' },
      {
        accent: '#FFB86B',
        description: 'Team.',
        id: 'team',
        label: 'Team Rank',
      },
    ] as const;

    expect(selectPrimaryHomeReadyModes(modes).map((mode) => mode.id)).toEqual([
      'setlove',
      'soulmate',
      'normal',
      'rank',
    ]);
  });

  it('describes matched records as connections instead of online presence', () => {
    expect(formatMatchedConnectionCount(3)).toBe('3 match mới');
    expect(formatMatchedConnectionCount(0)).toBe('Chưa có match mới');
  });

  it('keeps hero tags scannable and exposes overflow explicitly', () => {
    expect(
      buildMatchedSetTags({
        heroNames: ['Aya', 'Helen', 'Annette', 'Alice', 'Aya'],
        roleNames: ['Trợ Thủ'],
      }),
    ).toEqual(['Aya', 'Helen', 'Annette', '+1']);
    expect(
      buildMatchedSetTags({ heroNames: [], roleNames: ['Đi Rừng', 'Sát Thủ'] }),
    ).toEqual(['Đi Rừng', 'Sát Thủ']);
  });

  it('makes unread counts belong to the chat action', () => {
    expect(chatActionAccessibilityLabel('Minh Anh', 2)).toBe(
      'Nhắn tin với Minh Anh, 2 tin mới',
    );
    expect(chatActionAccessibilityLabel('Minh Anh', undefined)).toBe(
      'Nhắn tin với Minh Anh',
    );
  });
});
