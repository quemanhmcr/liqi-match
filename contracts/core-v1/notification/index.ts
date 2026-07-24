import { z } from 'zod';

import { DeepLinkV1Schema } from '../deep-link';
import {
  ConversationIdSchema,
  EventIdSchema,
  NotificationIdSchema,
  PlayerIdSchema,
} from '../identity/semantic-ids';
import { PlayerLifecycleStateV1Schema } from '../lifecycle/player-lifecycle';

export const NotificationKindV1Schema = z.enum([
  'match_created',
  'message_received',
  'set_invite',
  'join_request',
  'friendship_requested',
  'friendship_accepted',
  'system',
]);

export const PushDeviceRegistrationV1Schema = z
  .object({
    deviceInstallationId: z.string().min(1).max(160),
    enabled: z.boolean(),
    playerId: PlayerIdSchema,
  })
  .strict();

export const NotificationPresenceV1Schema = z
  .object({
    activeConversationId: ConversationIdSchema.nullable(),
    deviceInstallationId: z.string().min(1).max(160),
    expiresAt: z.string().datetime({ offset: true }),
    playerId: PlayerIdSchema,
    state: z.enum(['foreground', 'background']),
  })
  .strict();

export const NotificationDeepLinkResolutionStatusV1Schema = z.enum([
  'available',
  'defer_lifecycle',
  'defer_target',
  'disabled',
  'expired',
  'not_found',
  'player_unavailable',
  'provider_unavailable',
]);

export const NotificationDeepLinkResolutionV1Schema = z
  .object({
    deepLink: DeepLinkV1Schema.nullable(),
    notificationId: NotificationIdSchema,
    playerLifecycle: PlayerLifecycleStateV1Schema.nullable(),
    readAt: z.string().datetime({ offset: true }).nullable(),
    resolvedAt: z.string().datetime({ offset: true }),
    status: NotificationDeepLinkResolutionStatusV1Schema,
  })
  .strict()
  .superRefine((resolution, context) => {
    if (resolution.status === 'available' && resolution.deepLink === null) {
      context.addIssue({
        code: 'custom',
        message: 'Available resolution requires a canonical deep link.',
        path: ['deepLink'],
      });
    }
  });

export const PushNotificationNavigationDataV1Schema = z
  .object({
    contractVersion: z.literal(1),
    deepLink: DeepLinkV1Schema,
    notificationId: NotificationIdSchema,
    sourceEventId: EventIdSchema,
  })
  .strict();

export const NotificationPrimaryPlayerV1Schema = z
  .object({
    avatarAssetId: z.string().uuid().nullable(),
    displayName: z.string().trim().min(1).max(40),
    playerId: PlayerIdSchema,
  })
  .strict();

export const NotificationPresentationV1Schema = z
  .object({
    excerpt: z.string().trim().min(1).max(160).nullable(),
    primaryPlayer: NotificationPrimaryPlayerV1Schema.nullable(),
  })
  .strict()
  .superRefine((presentation, context) => {
    if (presentation.primaryPlayer === null && presentation.excerpt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Notification excerpts require a visible primary player.',
        path: ['excerpt'],
      });
    }
  });

export const NotificationV1Schema = z
  .object({
    deepLink: DeepLinkV1Schema,
    kind: NotificationKindV1Schema,
    notificationId: NotificationIdSchema,
    occurredAt: z.string().datetime({ offset: true }),
    presentation: NotificationPresentationV1Schema.nullable().optional(),
    readAt: z.string().datetime({ offset: true }).nullable(),
    recipientPlayerId: PlayerIdSchema,
    seenAt: z.string().datetime({ offset: true }).nullable(),
    sourceEventId: EventIdSchema,
  })
  .strict()
  .superRefine((notification, context) => {
    if (notification.readAt && !notification.seenAt) {
      context.addIssue({
        code: 'custom',
        message: 'readAt requires seenAt because read implies seen.',
        path: ['readAt'],
      });
    }
    if (
      notification.readAt &&
      notification.seenAt &&
      Date.parse(notification.readAt) < Date.parse(notification.seenAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'readAt cannot precede seenAt.',
        path: ['readAt'],
      });
    }

    const expectedTarget = {
      friendship_accepted: 'profile',
      friendship_requested: 'profile',
      join_request: 'set',
      match_created: 'match',
      message_received: 'conversation',
      set_invite: 'set',
      system: null,
    }[notification.kind];
    if (expectedTarget && notification.deepLink.target !== expectedTarget) {
      context.addIssue({
        code: 'custom',
        message: `${notification.kind} requires a ${expectedTarget} deep link.`,
        path: ['deepLink'],
      });
    }

    if (
      notification.presentation &&
      notification.kind !== 'match_created' &&
      notification.kind !== 'message_received'
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Notification presentation is available only for match and message notifications.',
        path: ['presentation'],
      });
    }
    if (
      notification.kind === 'match_created' &&
      notification.presentation?.excerpt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Match notifications cannot expose message excerpts.',
        path: ['presentation', 'excerpt'],
      });
    }
  });

export const NotificationWatermarkV1Schema = z
  .object({
    notificationId: NotificationIdSchema,
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const NotificationInboxPageV1Schema = z
  .object({
    items: z.array(NotificationV1Schema),
    latestWatermark: NotificationWatermarkV1Schema.nullable(),
    nextCursor: z.string().min(1).nullable(),
    unseenCount: z.number().int().nonnegative(),
  })
  .strict();

export const NotificationSummaryV1Schema = z
  .object({
    latestWatermark: NotificationWatermarkV1Schema.nullable(),
    unseenCount: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const MarkNotificationsSeenResultV1Schema = z
  .object({
    seenAt: z.string().datetime({ offset: true }),
    seenThrough: NotificationWatermarkV1Schema,
    unseenCount: z.number().int().nonnegative(),
  })
  .strict();

export const MarkNotificationReadResultV1Schema = z
  .object({
    notification: NotificationV1Schema,
    unseenCount: z.number().int().nonnegative(),
  })
  .strict();

// Lower-case aliases keep generated/mobile consumers additive without changing
// the provider-owned PascalCase contract surface.
export const notificationKindV1Schema = NotificationKindV1Schema;
export const pushDeviceRegistrationV1Schema = PushDeviceRegistrationV1Schema;
export const notificationPresenceV1Schema = NotificationPresenceV1Schema;
export const notificationDeepLinkResolutionStatusV1Schema =
  NotificationDeepLinkResolutionStatusV1Schema;
export const notificationDeepLinkResolutionV1Schema =
  NotificationDeepLinkResolutionV1Schema;
export const pushNotificationNavigationDataV1Schema =
  PushNotificationNavigationDataV1Schema;
export const notificationPrimaryPlayerV1Schema =
  NotificationPrimaryPlayerV1Schema;
export const notificationPresentationV1Schema =
  NotificationPresentationV1Schema;
export const notificationV1Schema = NotificationV1Schema;
export const notificationWatermarkV1Schema = NotificationWatermarkV1Schema;
export const notificationInboxPageV1Schema = NotificationInboxPageV1Schema;
export const notificationSummaryV1Schema = NotificationSummaryV1Schema;
export const markNotificationsSeenResultV1Schema =
  MarkNotificationsSeenResultV1Schema;
export const markNotificationReadResultV1Schema =
  MarkNotificationReadResultV1Schema;

export type NotificationKindV1 = z.infer<typeof NotificationKindV1Schema>;
export type PushDeviceRegistrationV1 = z.infer<
  typeof PushDeviceRegistrationV1Schema
>;
export type NotificationPresenceV1 = z.infer<
  typeof NotificationPresenceV1Schema
>;
export type NotificationDeepLinkResolutionStatusV1 = z.infer<
  typeof NotificationDeepLinkResolutionStatusV1Schema
>;
export type NotificationDeepLinkResolutionV1 = z.infer<
  typeof NotificationDeepLinkResolutionV1Schema
>;
export type PushNotificationNavigationDataV1 = z.infer<
  typeof PushNotificationNavigationDataV1Schema
>;
export type NotificationPrimaryPlayerV1 = z.infer<
  typeof NotificationPrimaryPlayerV1Schema
>;
export type NotificationPresentationV1 = z.infer<
  typeof NotificationPresentationV1Schema
>;
export type NotificationV1 = z.infer<typeof NotificationV1Schema>;
export type NotificationWatermarkV1 = z.infer<
  typeof NotificationWatermarkV1Schema
>;
export type NotificationInboxPageV1 = z.infer<
  typeof NotificationInboxPageV1Schema
>;
export type NotificationSummaryV1 = z.infer<typeof NotificationSummaryV1Schema>;
export type MarkNotificationsSeenResultV1 = z.infer<
  typeof MarkNotificationsSeenResultV1Schema
>;
export type MarkNotificationReadResultV1 = z.infer<
  typeof MarkNotificationReadResultV1Schema
>;
