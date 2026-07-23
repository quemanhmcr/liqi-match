import { describe, expect, it } from '@jest/globals';

import type { NotificationItem } from '../model/notification-view-model';
import { matchesNotificationFilter } from '../model/notification-filters';

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    attentionState: 'new',
    category: 'interaction',
    group: 'Hôm nay',
    id: 'notification-1',
    messageParts: ['Có cập nhật mới'],
    timeLabel: 'Vừa xong',
    title: 'Thông báo',
    visual: { icon: 'heart-outline', kind: 'symbol', tone: 'purple' },
    ...overrides,
  };
}

describe('notification filters', () => {
  it('keeps new and exposed items unread but excludes opened items', () => {
    expect(
      matchesNotificationFilter(item({ attentionState: 'new' }), 'unread'),
    ).toBe(true);
    expect(
      matchesNotificationFilter(item({ attentionState: 'unread' }), 'unread'),
    ).toBe(true);
    expect(
      matchesNotificationFilter(item({ attentionState: 'read' }), 'unread'),
    ).toBe(false);
  });

  it('presents interaction and set invitations together as activity', () => {
    expect(
      matchesNotificationFilter(item({ category: 'interaction' }), 'activity'),
    ).toBe(true);
    expect(
      matchesNotificationFilter(item({ category: 'set-invite' }), 'activity'),
    ).toBe(true);
    expect(
      matchesNotificationFilter(item({ category: 'message' }), 'activity'),
    ).toBe(false);
  });

  it('keeps message and system filters aligned with domain categories', () => {
    expect(
      matchesNotificationFilter(item({ category: 'message' }), 'message'),
    ).toBe(true);
    expect(
      matchesNotificationFilter(item({ category: 'system' }), 'system'),
    ).toBe(true);
    expect(matchesNotificationFilter(item(), 'all')).toBe(true);
  });
});
