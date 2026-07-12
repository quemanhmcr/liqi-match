import { describe, expect, it } from '@jest/globals';

import type { ChatMessage } from '@/features/messages/model/chat-message';
import {
  areMessagesInSameCluster,
  buildChatTimelineItems,
  CHAT_MESSAGE_CLUSTER_GAP_MS,
  CHAT_SESSION_GAP_MS,
  formatChatClock,
  formatChatTimelineLabel,
  formatInboxTimestamp,
  shouldInsertLightChatTimeGap,
  shouldStartChatSession,
} from '@/features/messages/model/chat-timeline';

function message(
  createdAt: string,
  direction: 'incoming' | 'outgoing' = 'incoming',
): Exclude<ChatMessage, { kind: 'typing' }> {
  return {
    createdAt,
    deliveryStatus: direction === 'outgoing' ? ('sent' as const) : undefined,
    direction,
    id: createdAt,
    kind: 'text' as const,
    text: 'Tin nhắn',
  } as Exclude<ChatMessage, { kind: 'typing' }>;
}

describe('chat timeline rules', () => {
  it('groups only nearby messages from the same direction', () => {
    const first = message('2026-07-11T10:00:00.000Z');
    const nearby = message(
      new Date(
        Date.parse(first.createdAt) + CHAT_MESSAGE_CLUSTER_GAP_MS,
      ).toISOString(),
    );
    const differentDirection = message(nearby.createdAt, 'outgoing');

    expect(areMessagesInSameCluster(first, nearby)).toBe(true);
    expect(areMessagesInSameCluster(first, differentDirection)).toBe(false);
  });

  it('uses a light gap for the same sender after one hour and a major separator for a new session', () => {
    const first = message('2026-07-11T10:00:00.000Z');
    const oneHourLater = message(
      new Date(Date.parse(first.createdAt) + CHAT_SESSION_GAP_MS).toISOString(),
    );
    const directionChanged = message(oneHourLater.createdAt, 'outgoing');
    const anotherIncomingSender = {
      ...oneHourLater,
      senderId: 'another-player',
    };
    const firstWithSender = { ...first, senderId: 'player-one' };
    const nextDay = message('2026-07-12T09:00:00.000Z');

    expect(shouldStartChatSession(undefined, first)).toBe(true);
    expect(shouldStartChatSession(first, oneHourLater)).toBe(false);
    expect(shouldInsertLightChatTimeGap(first, oneHourLater)).toBe(true);
    expect(shouldStartChatSession(first, directionChanged)).toBe(true);
    expect(shouldInsertLightChatTimeGap(first, directionChanged)).toBe(false);
    expect(
      shouldInsertLightChatTimeGap(firstWithSender, anotherIncomingSender),
    ).toBe(false);
    expect(shouldStartChatSession(firstWithSender, anotherIncomingSender)).toBe(
      true,
    );
    expect(shouldStartChatSession(first, nextDay)).toBe(true);
  });

  it('places one light time gap immediately before the later message', () => {
    const first = message('2026-07-11T10:00:00.000Z');
    const later = {
      ...message(
        new Date(
          Date.parse(first.createdAt) + CHAT_SESSION_GAP_MS,
        ).toISOString(),
      ),
      id: 'later-message',
    };
    const items = buildChatTimelineItems([first, later]);
    const gapIndex = items.findIndex((item) => item.kind === 'time-gap');

    expect(gapIndex).toBeGreaterThanOrEqual(0);
    expect(items[gapIndex]).toMatchObject({
      createdAt: later.createdAt,
      kind: 'time-gap',
    });
    expect(items[gapIndex + 1]).toMatchObject({
      kind: 'message',
      message: expect.objectContaining({ id: 'later-message' }),
    });
    expect(items.filter((item) => item.kind === 'separator')).toHaveLength(1);
  });

  it('formats clock, timeline and inbox labels from the same timestamp', () => {
    const reference = new Date(2026, 6, 11, 12, 0);
    const today = new Date(2026, 6, 11, 10, 5).toISOString();
    const yesterday = new Date(2026, 6, 10, 10, 5).toISOString();
    expect(formatChatClock(today)).toBe('10:05');
    expect(formatChatTimelineLabel(today, reference)).toBe('Hôm nay, 10:05');
    expect(formatChatTimelineLabel(yesterday, reference)).toBe(
      'Hôm qua, 10:05',
    );
    expect(formatInboxTimestamp(yesterday, reference)).toBe('Hôm qua');
  });

  it('places one unread marker immediately before the first unread message', () => {
    const first = message('2026-07-11T10:00:00.000Z');
    const unread = {
      ...message('2026-07-11T10:10:00.000Z'),
      id: 'first-unread',
    };
    const items = buildChatTimelineItems([first, unread], 'first-unread');
    const markerIndex = items.findIndex(
      (item) => item.kind === 'unread-marker',
    );

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    expect(items[markerIndex + 1]).toMatchObject({
      kind: 'message',
      message: expect.objectContaining({ id: 'first-unread' }),
    });
    expect(items.filter((item) => item.kind === 'unread-marker')).toHaveLength(
      1,
    );
  });
});
