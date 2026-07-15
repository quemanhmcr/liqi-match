import { z } from 'zod';

import { ActivityItemV2Schema } from '../activity/activity';
import { coreV2EventSchema } from '../events/event-envelope';
import {
  CorrelationIdSchema,
  EventIdSchema,
  PlayerIdSchema,
  PlaySessionIdSchema,
} from '../identity/semantic-ids';
import { SessionOutcomeIdSchema } from '../identity/semantic-ids';

export const ActivityNotificationTargetV2Schema = z.discriminatedUnion(
  'target',
  [
    z
      .object({
        outcomeId: SessionOutcomeIdSchema.nullable(),
        sessionId: PlaySessionIdSchema,
        target: z.literal('session_feedback'),
      })
      .strict(),
    z
      .object({
        playerId: PlayerIdSchema,
        target: z.literal('reputation'),
      })
      .strict(),
    z
      .object({
        sourceSessionId: PlaySessionIdSchema.nullable(),
        target: z.literal('repeat_play'),
        teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(4),
      })
      .strict()
      .superRefine((value, context) => {
        if (
          new Set(value.teammatePlayerIds).size !==
          value.teammatePlayerIds.length
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'teammatePlayerIds must be unique.',
            path: ['teammatePlayerIds'],
          });
        }
      }),
  ],
);
export type ActivityNotificationTargetV2 = z.infer<
  typeof ActivityNotificationTargetV2Schema
>;

export const ActivityDeliveryEligibilityReasonV2Schema = z.enum([
  'eligible',
  'activity_disabled',
  'kind_disabled',
  'push_disabled',
  'frequency_capped',
]);
export type ActivityDeliveryEligibilityReasonV2 = z.infer<
  typeof ActivityDeliveryEligibilityReasonV2Schema
>;

export const ActivityDeliveryEligibilityDecisionV2Schema = z
  .object({
    decisionId: z.string().uuid(),
    engagementPreferencesVersion: z.number().int().positive(),
    evaluatedAt: z.string().datetime({ offset: true }),
    frequencyWindowKey: z.string().min(1).max(120),
    inboxAllowed: z.boolean(),
    maxReactivationNotificationsPerDay: z.number().int().min(0).max(4),
    pushAllowed: z.boolean(),
    reactivationNotificationsUsed: z.number().int().nonnegative(),
    reason: ActivityDeliveryEligibilityReasonV2Schema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.pushAllowed && !decision.inboxAllowed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Push delivery requires an inbox-visible activity item.',
        path: ['pushAllowed'],
      });
    }
    if (
      decision.reason === 'eligible' &&
      (!decision.inboxAllowed || !decision.pushAllowed)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Eligible activity delivery must allow inbox and push.',
        path: ['reason'],
      });
    }
    if (
      decision.reason === 'frequency_capped' &&
      decision.reactivationNotificationsUsed <
        decision.maxReactivationNotificationsPerDay
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Frequency-capped decisions require a consumed daily cap.',
        path: ['reactivationNotificationsUsed'],
      });
    }
  });
export type ActivityDeliveryEligibilityDecisionV2 = z.infer<
  typeof ActivityDeliveryEligibilityDecisionV2Schema
>;

export const ActivityNotificationRequestV2Schema = z
  .object({
    activityItem: ActivityItemV2Schema,
    causationId: EventIdSchema,
    correlationId: CorrelationIdSchema,
    deliveryDecision: ActivityDeliveryEligibilityDecisionV2Schema,
    sourceEventId: EventIdSchema,
    target: ActivityNotificationTargetV2Schema,
  })
  .strict()
  .superRefine((request, context) => {
    const expectedTarget = {
      feedback_prompt: 'session_feedback',
      reputation_progress: 'reputation',
      repeat_play_recommendation: 'repeat_play',
    }[request.activityItem.kind];
    if (request.target.target !== expectedTarget) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${request.activityItem.kind} requires ${expectedTarget} target.`,
        path: ['target'],
      });
    }
    if (
      request.target.target === 'reputation' &&
      request.target.playerId !== request.activityItem.playerId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reputation target must be the activity recipient.',
        path: ['target', 'playerId'],
      });
    }
    if (
      request.target.target === 'repeat_play' &&
      request.target.teammatePlayerIds.includes(request.activityItem.playerId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Repeat-play teammates cannot include the recipient.',
        path: ['target', 'teammatePlayerIds'],
      });
    }
  });
export type ActivityNotificationRequestV2 = z.infer<
  typeof ActivityNotificationRequestV2Schema
>;

export const ActivityNotificationDeliveryStatusV2Schema = z.enum([
  'not_requested',
  'queued',
  'suppressed_by_supplier',
  'suppressed_by_delivery_runtime',
]);

export const ActivityNotificationReceiptV2Schema = z
  .object({
    activityItemId: z.string().uuid(),
    correlationId: CorrelationIdSchema,
    deduplicationKey: z.string().min(8).max(180),
    inboxStatus: ActivityNotificationDeliveryStatusV2Schema,
    notificationRequestId: z.string().uuid(),
    pushStatus: ActivityNotificationDeliveryStatusV2Schema,
    recipientPlayerId: PlayerIdSchema,
    repeated: z.boolean(),
    sourceEventId: EventIdSchema,
    target: ActivityNotificationTargetV2Schema,
  })
  .strict();
export type ActivityNotificationReceiptV2 = z.infer<
  typeof ActivityNotificationReceiptV2Schema
>;

export const ActivityNotificationRequestedEventV2Schema = coreV2EventSchema({
  aggregateType: 'notification_request',
  eventType: 'notification.requested.v2',
  payload: z
    .object({
      receipt: ActivityNotificationReceiptV2Schema,
    })
    .strict(),
});
export type ActivityNotificationRequestedEventV2 = z.infer<
  typeof ActivityNotificationRequestedEventV2Schema
>;

export const ActivityNotificationClickFactV2Schema = z
  .object({
    activityItemId: z.string().uuid(),
    clickedAt: z.string().datetime({ offset: true }),
    correlationId: CorrelationIdSchema,
    notificationRequestId: z.string().uuid(),
    recipientPlayerId: PlayerIdSchema,
    sourceEventId: EventIdSchema,
    target: ActivityNotificationTargetV2Schema,
  })
  .strict();
export type ActivityNotificationClickFactV2 = z.infer<
  typeof ActivityNotificationClickFactV2Schema
>;

export const ActivityNotificationRequestEmittedEventV2Schema =
  coreV2EventSchema({
    aggregateType: 'activity_item',
    eventType: 'activity.notification_requested.v2',
    payload: z
      .object({ request: ActivityNotificationRequestV2Schema })
      .strict(),
  }).superRefine((event, context) => {
    if (event.causationId !== event.payload.request.sourceEventId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'The notification request event must be caused by its source activity event.',
        path: ['causationId'],
      });
    }
    if (event.correlationId !== event.payload.request.correlationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Notification request correlation must be preserved.',
        path: ['correlationId'],
      });
    }
  });
export type ActivityNotificationRequestEmittedEventV2 = z.infer<
  typeof ActivityNotificationRequestEmittedEventV2Schema
>;
