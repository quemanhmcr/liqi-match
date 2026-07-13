import type { AuthSession } from '@/shared/auth/auth-service';
import {
  markSimulationNotificationRead,
  markSimulationNotificationsSeenThrough,
  type NotificationId,
  type ProductionSimulationRuntime,
  type ProfileId,
  type SimulatedMessage,
  type SimulatedNotification,
  type SimulationWorldSnapshot,
} from '@/entities/simulation';

import {
  compareNotificationWatermarks,
  countUnseenNotifications,
  latestNotificationWatermark,
  type NotificationActor,
  type NotificationRecord,
} from '../model/notification';
import {
  createSimulationNotificationInboxRepository,
  NotificationSimulationError,
  partialSimulationItems,
  type SimulationNotificationLens,
} from './simulation-notification-inbox.repository';

export type CanonicalSimulationNotificationRepositoryOptions = Readonly<{
  recipientIdForSession?: (
    world: Readonly<SimulationWorldSnapshot>,
    session: AuthSession,
  ) => ProfileId;
  runtime: ProductionSimulationRuntime;
}>;

export function createCanonicalSimulationNotificationInboxRepository(
  options: CanonicalSimulationNotificationRepositoryOptions,
) {
  const recipientIdForSession =
    options.recipientIdForSession ?? defaultRecipientIdForSession;
  const lens: SimulationNotificationLens<SimulationWorldSnapshot> = {
    getSummary: (world, input, context) => {
      const recipientId = recipientIdForSession(world, input.session);
      const notifications = notificationsForRecipient(world, recipientId);
      return {
        latestWatermark: latestNotificationWatermark(notifications),
        unseenCount: countUnseenNotifications(notifications),
        updatedAt: context.clock.now().toISOString(),
      };
    },
    list: (world, input, context) => {
      const recipientId = recipientIdForSession(world, input.session);
      const notifications = notificationsForRecipient(world, recipientId);
      const offset = parseNotificationCursor(input.cursor);
      const limit = normalizeLimit(input.limit);
      const page = partialSimulationItems(
        notifications.slice(offset, offset + limit),
        context,
      );
      const nextOffset = offset + page.length;
      return {
        items: page,
        latestWatermark: latestNotificationWatermark(notifications),
        nextCursor:
          nextOffset < notifications.length
            ? `notifications:v1:${nextOffset}`
            : null,
        unseenCount: countUnseenNotifications(notifications),
      };
    },
    markRead: (world, input, context) => {
      const recipientId = recipientIdForSession(world, input.session);
      const notification =
        world.notifications[
          input.notificationId as keyof typeof world.notifications
        ];
      if (!notification || notification.recipientId !== recipientId) {
        throw new NotificationSimulationError(
          'validation_error',
          'Notification không tồn tại trong inbox mô phỏng.',
          false,
        );
      }
      const updatedNotification = markSimulationNotificationRead(world, {
        notificationId: input.notificationId as NotificationId,
        now: context.clock.now().toISOString(),
        profileId: recipientId,
      });
      const notifications = notificationsForRecipient(world, recipientId);
      return {
        notification: projectNotification(world, updatedNotification),
        unseenCount: countUnseenNotifications(notifications),
      };
    },
    markSeenThrough: (world, input, context) => {
      const recipientId = recipientIdForSession(world, input.session);
      const notifications = notificationsForRecipient(world, recipientId);
      const watermarkExists = notifications.some(
        (notification) =>
          notification.id === input.seenThrough.id &&
          notification.occurredAt === input.seenThrough.occurredAt,
      );
      if (!watermarkExists) {
        throw new NotificationSimulationError(
          'stale_cursor',
          'Notification watermark không còn hợp lệ.',
          true,
        );
      }
      const seenAt = context.clock.now().toISOString();
      markSimulationNotificationsSeenThrough(world, {
        now: seenAt,
        profileId: recipientId,
        seenThrough: {
          id: input.seenThrough.id as NotificationId,
          occurredAt: input.seenThrough.occurredAt,
        },
      });
      const updated = notificationsForRecipient(world, recipientId);
      return {
        seenAt,
        seenThrough: input.seenThrough,
        unseenCount: countUnseenNotifications(updated),
      };
    },
  };

  return createSimulationNotificationInboxRepository({
    lens,
    runtime: options.runtime,
  });
}

function defaultRecipientIdForSession(
  world: Readonly<SimulationWorldSnapshot>,
  session: AuthSession,
) {
  const candidate = session.user.id as ProfileId;
  return world.profiles[candidate] ? candidate : world.viewerId;
}

function notificationsForRecipient(
  world: Readonly<SimulationWorldSnapshot>,
  recipientId: ProfileId,
) {
  return Object.values(world.notifications)
    .filter((notification) => notification.recipientId === recipientId)
    .map((notification) => projectNotification(world, notification))
    .sort((left, right) =>
      compareNotificationWatermarks(
        { id: right.id, occurredAt: right.occurredAt },
        { id: left.id, occurredAt: left.occurredAt },
      ),
    );
}

function projectNotification(
  world: Readonly<SimulationWorldSnapshot>,
  notification: SimulatedNotification,
): NotificationRecord {
  const base = {
    id: notification.id,
    kind: notification.kind,
    occurredAt: notification.occurredAt,
    readAt: notification.readAt,
    recipientId: notification.recipientId,
    seenAt: notification.seenAt,
  } as const;

  switch (notification.kind) {
    case 'set-invite': {
      const set = requireSet(world, notification.payload.setId);
      return {
        ...base,
        kind: 'set-invite',
        payload: {
          actor: actor(world, notification.payload.actorId),
          setId: set.id,
          setName: set.title,
        },
      };
    }
    case 'direct-message': {
      const message = world.messages[notification.payload.messageId];
      return {
        ...base,
        kind: 'direct-message',
        payload: {
          actor: actor(world, notification.payload.actorId),
          conversationId: notification.payload.conversationId,
          excerpt: message ? messagePreview(message) : 'Tin nhắn mới',
        },
      };
    }
    case 'praise-received':
      return {
        ...base,
        kind: 'praise-received',
        payload: {
          actors: notification.payload.actorIds.map((profileId) =>
            actor(world, profileId),
          ),
          count: notification.payload.count,
        },
      };
    case 'team-event': {
      const set = requireSet(world, notification.payload.setId);
      return {
        ...base,
        kind: 'team-event',
        payload: {
          startsAt: notification.payload.startsAt,
          teamId: set.id,
          teamName: set.title,
        },
      };
    }
    case 'profile-liked':
      return {
        ...base,
        kind: 'profile-liked',
        payload: {
          actor: actor(world, notification.payload.actorId),
          profileId:
            notification.target.kind === 'profile'
              ? notification.target.profileId
              : notification.recipientId,
        },
      };
    case 'weekly-reward':
      return {
        ...base,
        kind: 'weekly-reward',
        payload: { ...notification.payload },
      };
    case 'reputation-changed':
      return {
        ...base,
        kind: 'reputation-changed',
        payload: { ...notification.payload },
      };
  }
}

function actor(
  world: Readonly<SimulationWorldSnapshot>,
  profileId: ProfileId,
): NotificationActor {
  const profile = world.profiles[profileId];
  if (!profile) {
    throw new NotificationSimulationError(
      'validation_error',
      `Notification actor không tồn tại: ${profileId}.`,
      false,
    );
  }
  return {
    displayName: profile.canonicalProfile.profileBasics.displayName,
    id: profile.id,
  };
}

function requireSet(
  world: Readonly<SimulationWorldSnapshot>,
  setId: keyof SimulationWorldSnapshot['sets'],
) {
  const set = world.sets[setId];
  if (!set) {
    throw new NotificationSimulationError(
      'validation_error',
      `Notification set không tồn tại: ${String(setId)}.`,
      false,
    );
  }
  return set;
}

function messagePreview(message: SimulatedMessage) {
  switch (message.kind) {
    case 'text':
      return message.text;
    case 'media':
      return (
        message.caption ||
        (message.mediaType === 'video' ? 'Đã gửi một video' : 'Đã gửi một ảnh')
      );
    case 'build_share':
      return message.text;
    case 'team_invite':
      return message.text;
  }
}

function normalizeLimit(limit?: number) {
  if (limit === undefined) return 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new NotificationSimulationError(
      'validation_error',
      'Notification limit phải nằm trong khoảng 1–100.',
      false,
    );
  }
  return limit;
}

function parseNotificationCursor(cursor?: string) {
  if (!cursor) return 0;
  const match = /^notifications:v1:(\d+)$/.exec(cursor);
  if (!match) {
    throw new NotificationSimulationError(
      'stale_cursor',
      'Notification cursor không hợp lệ hoặc đã hết hạn.',
      true,
    );
  }
  return Number(match[1]);
}
