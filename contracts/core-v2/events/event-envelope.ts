import { z } from 'zod';

import {
  CorrelationIdSchema,
  EventIdSchema,
  PlayerIdSchema,
} from '../../core-v1/identity/semantic-ids';

export const CoreV2EventEnvelopeSchema = z
  .object({
    actorPlayerId: PlayerIdSchema.nullable(),
    aggregateId: z.string().uuid(),
    aggregateType: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    aggregateVersion: z.number().int().positive(),
    causationId: EventIdSchema.nullable(),
    correlationId: CorrelationIdSchema,
    eventId: EventIdSchema,
    eventType: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v2$/),
    eventVersion: z.literal(2),
    occurredAt: z.string().datetime({ offset: true }),
    payload: z.unknown(),
  })
  .strict();

export type CoreV2EventEnvelope = z.infer<typeof CoreV2EventEnvelopeSchema>;

export function coreV2EventSchema<
  EventType extends string,
  AggregateType extends string,
  PayloadSchema extends z.ZodType,
>(input: {
  aggregateType: AggregateType;
  eventType: EventType;
  payload: PayloadSchema;
}) {
  return CoreV2EventEnvelopeSchema.extend({
    aggregateType: z.literal(input.aggregateType),
    eventType: z.literal(input.eventType),
    eventVersion: z.literal(2),
    payload: input.payload,
  });
}
