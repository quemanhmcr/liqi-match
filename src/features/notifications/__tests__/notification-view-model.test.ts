import { describe, expect, it } from '@jest/globals';

import { createMockNotificationSeed } from '@/entities/notifications/data/mock-notification-inbox.repository';
import {
  formatNotificationTime,
  mapNotificationToViewModel,
} from '@/features/notifications/model/notification-view-model';

const now = new Date('2026-07-11T09:00:00.000Z');

describe('notification view model', () => {
  it('maps typed backend payloads without backend-owned visual metadata', () => {
    const records = createMockNotificationSeed('user-a', now);
    const invite = mapNotificationToViewModel(records[0]!, now);
    const message = mapNotificationToViewModel(records[1]!, now);
    const reward = mapNotificationToViewModel(records[5]!, now);

    expect(invite).toMatchObject({
      category: 'set-invite',
      group: 'Hôm nay',
      isSeen: false,
      messageParts: ['đã mời bạn vào set', '“Team Sao Băng”'],
      timeLabel: '2 phút trước',
      title: 'Minh Anh',
      visual: { kind: 'avatar', tone: 'purple' },
    });
    expect(message.action).toEqual({ label: 'Trả lời', tone: 'blue' });
    expect(reward).toMatchObject({
      category: 'system',
      group: 'Trước đó',
      isSeen: true,
      reward: { label: 'x50' },
      title: 'Hệ thống:',
    });
  });

  it('formats yesterday separately from an empty or current inbox state', () => {
    expect(formatNotificationTime('2026-07-10T09:00:00.000Z', now)).toBe(
      'Hôm qua',
    );
  });
});
