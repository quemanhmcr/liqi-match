import { describe, expect, it } from '@jest/globals';

import { createMockNotificationSeed } from '../data/mock-notification-inbox.repository';
import {
  markNotificationFeedSeenThrough,
  markNotificationPageRead,
  markNotificationPageSeenThrough,
  markNotificationSummarySeenThrough,
} from '../model/notification-inbox-query';
import {
  latestNotificationWatermark,
  type NotificationInboxPage,
} from '../model/notification';
import type { NotificationInboxFeedData } from '../model/notification-inbox-query';

const now = new Date('2026-07-11T09:00:00.000Z');

function page(): NotificationInboxPage {
  const items = createMockNotificationSeed('user-a', now);
  return {
    items,
    nextCursor: null,
    latestWatermark: latestNotificationWatermark(items),
    unseenCount: 3,
  };
}

describe('notification inbox optimistic reducers', () => {
  it('does not optimistically consume a notification newer than the watermark', () => {
    const current = page();
    const secondNewest = current.items[1]!;
    const updated = markNotificationPageSeenThrough(
      current,
      { id: secondNewest.id, occurredAt: secondNewest.occurredAt },
      now.toISOString(),
    );

    expect(updated.unseenCount).toBe(1);
    expect(updated.items[0]?.seenAt).toBeNull();
    expect(updated.items[1]?.seenAt).toBe(now.toISOString());
  });

  it('updates every loaded page while preserving one total unseen count', () => {
    const current = page();
    const feed: NotificationInboxFeedData = {
      pageParams: [null, 'offset:2'],
      pages: [
        {
          ...current,
          items: current.items.slice(0, 2),
          nextCursor: 'offset:2',
        },
        { ...current, items: current.items.slice(2), nextCursor: null },
      ],
    };

    const updated = markNotificationFeedSeenThrough(
      feed,
      current.latestWatermark!,
      now.toISOString(),
    );

    expect(updated.pages.every((item) => item.unseenCount === 0)).toBe(true);
    expect(
      updated.pages
        .flatMap((item) => item.items)
        .filter((item) =>
          [
            'invite-team-sao-bang',
            'message-khoa-jungle',
            'praise-teammates',
          ].includes(item.id),
        )
        .every((item) => item.seenAt === now.toISOString()),
    ).toBe(true);
  });

  it('keeps summary unseen state when the server knows about a newer item', () => {
    const current = page();
    const latest = current.latestWatermark!;
    const older = current.items[1]!;

    expect(
      markNotificationSummarySeenThrough(
        {
          latestWatermark: latest,
          unseenCount: 3,
          updatedAt: now.toISOString(),
        },
        { id: older.id, occurredAt: older.occurredAt },
      ).unseenCount,
    ).toBe(3);
  });

  it('marks a selected item read without double-decrementing unseen count', () => {
    const first = markNotificationPageRead(
      page(),
      'message-khoa-jungle',
      now.toISOString(),
    );
    const second = markNotificationPageRead(
      first,
      'message-khoa-jungle',
      now.toISOString(),
    );

    expect(first.unseenCount).toBe(2);
    expect(second.unseenCount).toBe(2);
  });
});
