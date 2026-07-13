import { describe, expect, it } from '@jest/globals';

import { createGoldenWorldAssetResolver } from '@/entities/media-asset';
import { createMockNotificationSeed } from '@/entities/notifications/data/mock-notification-inbox.repository';
import {
  formatNotificationTime,
  mapNotificationToViewModel,
} from '@/features/notifications/model/notification-view-model';

const now = new Date('2026-07-11T09:00:00.000Z');
const assetResolver = createGoldenWorldAssetResolver();

describe('notification view model', () => {
  it('maps typed backend payloads without backend-owned visual metadata', () => {
    const records = createMockNotificationSeed('user-a', now);
    const invite = mapNotificationToViewModel(records[0]!, {
      assetResolver,
      now,
    });
    const directMessage = records[1];
    if (directMessage?.kind !== 'direct-message') {
      throw new Error('Expected the second notification to be direct-message.');
    }
    const message = mapNotificationToViewModel(directMessage, {
      assetResolver,
      now,
    });
    const reward = mapNotificationToViewModel(records[5]!, {
      assetResolver,
      now,
    });

    expect(invite).toMatchObject({
      category: 'set-invite',
      group: 'Hôm nay',
      isSeen: false,
      messageParts: ['đã mời bạn vào set', '“Team Sao Băng”'],
      timeLabel: '2 phút trước',
      title: 'Minh Anh',
      visual: { kind: 'avatar', tone: 'purple' },
    });
    expect(message.action).toEqual({
      destination: {
        conversationId: directMessage.payload.conversationId,
        kind: 'conversation',
      },
      label: 'Trả lời',
      tone: 'blue',
    });
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
