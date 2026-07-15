import {
  MarkNotificationReadResultV1Schema,
  MarkNotificationsSeenResultV1Schema,
  NotificationInboxPageV1Schema,
  NotificationSummaryV1Schema,
  type NotificationV1,
} from '@/shared/contracts/core-v1';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type {
  GetNotificationInboxSummaryInput,
  ListNotificationInboxInput,
  MarkNotificationReadInput,
  MarkNotificationsSeenInput,
  NotificationInboxRepository,
  NotificationRecord,
} from '../model/notification';

export type NotificationApiRequest = Readonly<{
  body?: Readonly<Record<string, unknown>>;
  path: string;
  session: GetNotificationInboxSummaryInput['session'];
  signal?: AbortSignal;
}>;

export type NotificationApiTransport = Readonly<{
  request(request: NotificationApiRequest): Promise<unknown>;
}>;

export class ApiNotificationInboxRepository implements NotificationInboxRepository {
  constructor(private readonly transport: NotificationApiTransport) {}

  async getSummary(input: GetNotificationInboxSummaryInput) {
    const response = await this.transport.request({
      path: 'rpc/get_notification_summary_v1',
      session: input.session,
      signal: input.signal,
    });
    const summary = NotificationSummaryV1Schema.parse(response);
    return {
      latestWatermark: mapWatermark(summary.latestWatermark),
      unseenCount: summary.unseenCount,
      updatedAt: summary.updatedAt,
    };
  }

  async list(input: ListNotificationInboxInput) {
    const response = await this.transport.request({
      body: {
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
      },
      path: 'rpc/list_notifications_v1',
      session: input.session,
      signal: input.signal,
    });
    const page = NotificationInboxPageV1Schema.parse(response);
    return {
      items: page.items.map(mapNotification),
      latestWatermark: mapWatermark(page.latestWatermark),
      nextCursor: page.nextCursor,
      unseenCount: page.unseenCount,
    };
  }

  async markSeenThrough(input: MarkNotificationsSeenInput) {
    const response = await this.transport.request({
      body: { p_notification_id: input.seenThrough.id },
      path: 'rpc/mark_notifications_seen_through_v1',
      session: input.session,
      signal: input.signal,
    });
    const result = MarkNotificationsSeenResultV1Schema.parse(response);
    return {
      seenAt: result.seenAt,
      seenThrough: {
        id: result.seenThrough.notificationId,
        occurredAt: result.seenThrough.occurredAt,
      },
      unseenCount: result.unseenCount,
    };
  }

  async markRead(input: MarkNotificationReadInput) {
    const response = await this.transport.request({
      body: { p_notification_id: input.notificationId },
      path: 'rpc/mark_notification_read_v1',
      session: input.session,
      signal: input.signal,
    });
    const result = MarkNotificationReadResultV1Schema.parse(response);
    return {
      notification: mapNotification(result.notification),
      unseenCount: result.unseenCount,
    };
  }
}

export function createApiNotificationInboxRepository(
  transport: NotificationApiTransport = createNotificationSupabaseTransport(),
) {
  return new ApiNotificationInboxRepository(transport);
}

export function createNotificationSupabaseTransport(): NotificationApiTransport {
  return {
    request: ({ body, path, session, signal }) =>
      supabaseRest<unknown>(path, {
        ...(body ? { body } : {}),
        method: 'POST',
        session,
        signal,
      }),
  };
}

function mapWatermark(
  watermark: { notificationId: string; occurredAt: string } | null | undefined,
) {
  return watermark
    ? { id: watermark.notificationId, occurredAt: watermark.occurredAt }
    : null;
}

function mapNotification(notification: NotificationV1): NotificationRecord {
  const base = {
    id: notification.notificationId,
    occurredAt: notification.occurredAt,
    readAt: notification.readAt,
    recipientId: notification.recipientPlayerId,
    seenAt: notification.seenAt,
  } as const;

  switch (notification.kind) {
    case 'match_created':
      if (notification.deepLink.target !== 'match') return neverNotification();
      return {
        ...base,
        kind: 'match-created',
        payload: { matchId: notification.deepLink.matchId },
      };
    case 'message_received':
      if (notification.deepLink.target !== 'conversation')
        return neverNotification();
      return {
        ...base,
        kind: 'message-received',
        payload: { conversationId: notification.deepLink.conversationId },
      };
    case 'set_invite':
      if (notification.deepLink.target !== 'set') return neverNotification();
      return {
        ...base,
        kind: 'set-invite-received',
        payload: { setId: notification.deepLink.setId },
      };
    case 'join_request':
      if (notification.deepLink.target !== 'set') return neverNotification();
      return {
        ...base,
        kind: 'join-request',
        payload: { setId: notification.deepLink.setId },
      };
    case 'friendship_requested':
      if (notification.deepLink.target !== 'profile')
        return neverNotification();
      return {
        ...base,
        kind: 'friendship-requested',
        payload: { requesterPlayerId: notification.deepLink.playerId },
      };
    case 'friendship_accepted':
      if (notification.deepLink.target !== 'profile')
        return neverNotification();
      return {
        ...base,
        kind: 'friendship-accepted',
        payload: { friendPlayerId: notification.deepLink.playerId },
      };
    case 'system':
      return {
        ...base,
        kind: 'system',
        payload: { deepLink: notification.deepLink },
      };
  }
}

function neverNotification(): never {
  throw new Error(
    'Notification deep-link semantics violated the core-v1 contract.',
  );
}
