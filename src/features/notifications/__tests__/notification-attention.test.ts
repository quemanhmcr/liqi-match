import { describe, expect, it } from '@jest/globals';

import {
  isNotificationAttentionStateUnread,
  resolveNotificationAttentionState,
  type NotificationAttentionState,
} from '../model/notification-attention';

const attentionCases: [
  notification: { readAt: string | null; seenAt: string | null },
  expected: NotificationAttentionState,
][] = [
  [{ readAt: null, seenAt: null }, 'new'],
  [{ readAt: null, seenAt: '2026-07-23T10:00:00.000Z' }, 'unread'],
  [
    {
      readAt: '2026-07-23T10:01:00.000Z',
      seenAt: '2026-07-23T10:00:00.000Z',
    },
    'read',
  ],
];

describe('notification attention authority', () => {
  it.each(attentionCases)('resolves %j as %s', (notification, expected) => {
    expect(resolveNotificationAttentionState(notification)).toBe(expected);
  });

  it('keeps both new and exposed notifications in the unread product filter', () => {
    expect(isNotificationAttentionStateUnread('new')).toBe(true);
    expect(isNotificationAttentionStateUnread('unread')).toBe(true);
    expect(isNotificationAttentionStateUnread('read')).toBe(false);
  });
});
