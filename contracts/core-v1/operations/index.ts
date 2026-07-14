import { z } from 'zod';

export const ReturnLoopApiE2eStatusV1Schema = z.enum(['passed', 'failed']);

export const ReturnLoopApiE2eRunV1Schema = z
  .object({
    completedAt: z.string().datetime({ offset: true }),
    report: z.record(z.string(), z.unknown()),
    runId: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true }),
    status: ReturnLoopApiE2eStatusV1Schema,
  })
  .strict()
  .superRefine((run, context) => {
    if (Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'completedAt cannot precede startedAt.',
        path: ['completedAt'],
      });
    }
  });

export const ReturnLoopReleaseReadinessV1Schema = z
  .object({
    apiModeE2e: z
      .object({
        lastCompletedAt: z.string().datetime({ offset: true }).nullable(),
        lastRunId: z.string().uuid().nullable(),
        lastStatus: ReturnLoopApiE2eStatusV1Schema.nullable(),
      })
      .strict(),
    checks: z
      .object({
        apiModeE2eFresh: z.boolean(),
        deepLinkSloHealthy: z.boolean(),
        duplicateNotificationsHealthy: z.boolean(),
        matchConversationFunnelHealthy: z.boolean(),
        pushBacklogHealthy: z.boolean(),
        pushProviderObserved: z.boolean(),
      })
      .strict(),
    flags: z
      .object({
        coreLoopEnabled: z.boolean(),
        deepLinkEnabled: z.boolean(),
        homeEnabled: z.boolean(),
        inboxEnabled: z.boolean(),
        pushEnabled: z.boolean(),
      })
      .strict(),
    generatedAt: z.string().datetime({ offset: true }),
    metrics: z
      .object({
        conversationReadyCount: z.number().int().nonnegative(),
        deepLinkAttemptCount: z.number().int().nonnegative(),
        deepLinkAvailableCount: z.number().int().nonnegative(),
        deepLinkSuccessRate: z.number().min(0).max(1).nullable(),
        duplicateNotificationCount: z.number().int().nonnegative(),
        matchConversationDivergenceCount: z.number().int().nonnegative(),
        matchConversationReadyRate: z.number().min(0).max(1).nullable(),
        matchCreatedCount: z.number().int().nonnegative(),
        oldestMatchConversationPendingSeconds: z.number().nonnegative(),
        pushDeliveryCount: z.number().int().nonnegative(),
        pushProviderErrorCount: z.number().int().nonnegative(),
        stalePushJobCount: z.number().int().nonnegative(),
        unexplainedMatchConversationDivergenceCount: z
          .number()
          .int()
          .nonnegative(),
      })
      .strict(),
    ready: z.boolean(),
    windowStartedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const returnLoopApiE2eStatusV1Schema = ReturnLoopApiE2eStatusV1Schema;
export const returnLoopApiE2eRunV1Schema = ReturnLoopApiE2eRunV1Schema;
export const returnLoopReleaseReadinessV1Schema =
  ReturnLoopReleaseReadinessV1Schema;

export type ReturnLoopApiE2eStatusV1 = z.infer<
  typeof ReturnLoopApiE2eStatusV1Schema
>;
export type ReturnLoopApiE2eRunV1 = z.infer<typeof ReturnLoopApiE2eRunV1Schema>;
export type ReturnLoopReleaseReadinessV1 = z.infer<
  typeof ReturnLoopReleaseReadinessV1Schema
>;
