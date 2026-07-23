import type { NotificationRecord } from '@/entities/notifications';

export type NotificationAttentionState = 'new' | 'unread' | 'read';

/** Separates inbox exposure from the user's explicit read action. */
export function resolveNotificationAttentionState(
  notification: Pick<NotificationRecord, 'readAt' | 'seenAt'>,
): NotificationAttentionState {
  if (notification.readAt) return 'read';
  if (notification.seenAt) return 'unread';
  return 'new';
}

export function isNotificationAttentionStateUnread(
  state: NotificationAttentionState,
) {
  return state !== 'read';
}
