import type { NotificationInboxRepository } from '../model/notification';
import { mockNotificationInboxRepository } from './mock-notification-inbox.repository';

/**
 * Runtime composition point for Notifications server state.
 *
 * The current adapter is intentionally local/mock. A backend integration should
 * implement NotificationInboxRepository and switch only this binding; screens,
 * Home badge logic, query keys and optimistic updates remain unchanged.
 */
export const notificationInboxRepository: NotificationInboxRepository =
  mockNotificationInboxRepository;
