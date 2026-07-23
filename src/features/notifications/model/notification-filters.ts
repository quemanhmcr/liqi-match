import type { NotificationItem } from './notification-view-model';
import { isNotificationAttentionStateUnread } from './notification-attention';

export const notificationFilters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'message', label: 'Tin nhắn' },
  { id: 'activity', label: 'Hoạt động' },
  { id: 'system', label: 'Hệ thống' },
] as const;

export type NotificationFilterId = (typeof notificationFilters)[number]['id'];

export function matchesNotificationFilter(
  item: NotificationItem,
  filter: NotificationFilterId,
) {
  if (filter === 'all') return true;
  if (filter === 'unread') {
    return isNotificationAttentionStateUnread(item.attentionState);
  }
  if (filter === 'activity') {
    return item.category === 'interaction' || item.category === 'set-invite';
  }
  return item.category === filter;
}
