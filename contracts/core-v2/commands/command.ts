import { z } from 'zod';

import {
  CorrelationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
} from '../../core-v1';

export const CoreV2CommandOriginPlatformSchema = z.enum([
  'android',
  'ios',
  'web',
  'service',
  'simulation',
]);
export const CoreV2OperationalClientPlatformSchema =
  CoreV2CommandOriginPlatformSchema.exclude(['simulation']);
export const CoreV2InteractiveClientPlatformSchema =
  CoreV2OperationalClientPlatformSchema.exclude(['service']);
/** @deprecated Prefer CoreV2InteractiveClientPlatformSchema for new contracts. */
export const CoreV2ClientPlatformSchema = CoreV2InteractiveClientPlatformSchema;
export const CoreV2AuditTimestampSchema = z.string().datetime({ offset: true });
export const CoreV2AuditClientVersionSchema = z.string().trim().min(1).max(80);
export const CoreV2AuditInstallationIdSchema = z.string().uuid();

export const CoreV2CommandAuditMetadataSchema = z
  .object({
    appVersion: CoreV2AuditClientVersionSchema.max(64),
    clientCreatedAt: CoreV2AuditTimestampSchema,
    clientRequestId: z.string().uuid(),
    deviceInstallationId: CoreV2AuditInstallationIdSchema.optional(),
    platform: CoreV2InteractiveClientPlatformSchema,
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
