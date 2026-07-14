import { z } from 'zod';

import {
  CorrelationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
} from '../../core-v1';

export const CoreV2ClientPlatformSchema = z.enum(['android', 'ios', 'web']);

export const CoreV2CommandAuditMetadataSchema = z
  .object({
    appVersion: z.string().trim().min(1).max(64),
    clientCreatedAt: z.string().datetime({ offset: true }),
    clientRequestId: z.string().uuid(),
    deviceInstallationId: z.string().uuid().optional(),
    platform: CoreV2ClientPlatformSchema,
  })
  .strict();

export const CoreV2CreateCommandMetadataSchema = z
  .object({
    audit: CoreV2CommandAuditMetadataSchema,
    correlationId: CorrelationIdSchema,
    expectedVersion: z.literal(0),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const CoreV2MutationCommandMetadataSchema = z
  .object({
    audit: CoreV2CommandAuditMetadataSchema,
    correlationId: CorrelationIdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const CoreV2ReceiptBaseSchema = z
  .object({
    aggregateId: z.string().uuid(),
    aggregateVersion: z.number().int().positive(),
    correlationId: CorrelationIdSchema,
    eventIds: z.array(EventIdSchema).max(20),
    occurredAt: z.string().datetime({ offset: true }),
    repeated: z.boolean(),
  })
  .strict();

export const CoreV2ActorAuditSchema = z
  .object({
    actorPlayerId: PlayerIdSchema,
    correlationId: CorrelationIdSchema,
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type CoreV2CommandAuditMetadata = z.infer<
  typeof CoreV2CommandAuditMetadataSchema
>;
