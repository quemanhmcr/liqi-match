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
      action: {
        destination: {
          kind: 'set',
          setId:
            records[0]?.kind === 'set-invite' ? records[0].payload.setId : '',
        },
        label: 'Xem set',
      },
      attentionState: 'new',
      category: 'set-invite',
      group: 'Hôm nay',
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
    });
    expect(reward).toMatchObject({
      attentionState: 'read',
      category: 'system',
      group: 'Trước đó',
      reward: { label: 'x50' },
      title: 'Hệ thống:',
    });
  });

  it('keeps seen-but-unopened records unread', () => {
    const record = createMockNotificationSeed('user-a', now)[0]!;
    const item = mapNotificationToViewModel(
      {
        ...record,
        readAt: null,
        seenAt: '2026-07-11T08:59:00.000Z',
      },
      { assetResolver, now },
    );

    expect(item.attentionState).toBe('unread');
  });

  it('renders production message and match notifications without invented actor data', () => {
    const message = mapNotificationToViewModel(
      {
        id: 'notification-message',
        kind: 'message-received',
        occurredAt: now.toISOString(),
        payload: { conversationId: 'conversation-1' },
        readAt: null,
        recipientId: 'player-1',
        seenAt: null,
      },
      { assetResolver, now },
    );
    const match = mapNotificationToViewModel(
      {
        id: 'notification-match',
        kind: 'match-created',
        occurredAt: now.toISOString(),
        payload: { matchId: 'match-1' },
        readAt: null,
        recipientId: 'player-1',
        seenAt: null,
      },
      { assetResolver, now },
    );

    expect(message).toMatchObject({
      action: {
        destination: { conversationId: 'conversation-1', kind: 'conversation' },
      },
      messageParts: ['Bạn có tin nhắn mới'],
      title: 'Tin nhắn mới',
      visual: { kind: 'symbol' },
    });
    expect(match.action?.destination).toEqual({
      kind: 'match',
      matchId: 'match-1',
    });
  });

  it('routes friendship notifications to the latest authoritative profile state', () => {
    const request = mapNotificationToViewModel(
      {
        id: 'friendship-requested',
        kind: 'friendship-requested',
        occurredAt: now.toISOString(),
        payload: { requesterPlayerId: 'player-requester' },
        readAt: null,
        recipientId: 'player-recipient',
        seenAt: null,
      },
      { assetResolver, now },
    );
    const accepted = mapNotificationToViewModel(
      {
        id: 'friendship-accepted',
        kind: 'friendship-accepted',
        occurredAt: now.toISOString(),
        payload: { friendPlayerId: 'player-friend' },
        readAt: null,
        recipientId: 'player-requester',
        seenAt: null,
      },
      { assetResolver, now },
    );

    expect(request.action?.destination).toEqual({
      kind: 'profile',
      playerId: 'player-requester',
    });
    expect(request).toMatchObject({
      category: 'interaction',
      title: 'Lời mời kết bạn',
    });
    expect(accepted.action?.destination).toEqual({
      kind: 'profile',
      playerId: 'player-friend',
    });
  });

  it('formats yesterday separately from an empty or current inbox state', () => {
    expect(formatNotificationTime('2026-07-10T09:00:00.000Z', now)).toBe(
      'Hôm qua',
    );
  });
});
