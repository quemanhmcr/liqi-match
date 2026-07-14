import { z } from 'zod';

import {
  AccountIdSchema,
  DeepLinkV1Schema,
  NotificationIdSchema,
  EventIdSchema,
  type AccountId,
  type DeepLinkV1,
  type NotificationId,
  type EventId,
} from '@/shared/contracts/core-v1';

export const deepLinkIntentSourceSchema = z.enum([
  'external-url',
  'notification-response',
]);

export const pendingDeepLinkIntentV1Schema = z
  .strictObject({
    accountId: AccountIdSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    claimedAt: z.string().datetime({ offset: true }).nullable(),
    deepLink: DeepLinkV1Schema,
    enqueuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    intentId: z.string().min(1).max(240),
    notificationId: NotificationIdSchema.nullable(),
    source: deepLinkIntentSourceSchema,
    sourceEventId: EventIdSchema.nullable(),
  })
  .strict()
  .superRefine((intent, context) => {
    if (Date.parse(intent.expiresAt) <= Date.parse(intent.enqueuedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'expiresAt must be later than enqueuedAt.',
        path: ['expiresAt'],
      });
    }
    if (
      intent.source === 'notification-response' &&
      (!intent.notificationId || !intent.sourceEventId)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Notification response intents require notificationId and sourceEventId.',
        path: ['notificationId'],
      });
    }
  });

export type DeepLinkIntentSource = z.infer<typeof deepLinkIntentSourceSchema>;
export type PendingDeepLinkIntentV1 = z.infer<
  typeof pendingDeepLinkIntentV1Schema
>;

export type EnqueueDeepLinkIntentInput = Readonly<{
  accountId?: AccountId | null;
  deepLink: DeepLinkV1;
  enqueuedAt: string;
  expiresAt: string;
  intentId: string;
  notificationId?: NotificationId | null;
  source: DeepLinkIntentSource;
  sourceEventId?: EventId | null;
}>;

export function createPendingDeepLinkIntentV1(
  input: EnqueueDeepLinkIntentInput,
): PendingDeepLinkIntentV1 {
  return pendingDeepLinkIntentV1Schema.parse({
    accountId: input.accountId ?? null,
    attempts: 0,
    claimedAt: null,
    deepLink: input.deepLink,
    enqueuedAt: input.enqueuedAt,
    expiresAt: input.expiresAt,
    intentId: input.intentId,
    notificationId: input.notificationId ?? null,
    source: input.source,
    sourceEventId: input.sourceEventId ?? null,
  });
}
