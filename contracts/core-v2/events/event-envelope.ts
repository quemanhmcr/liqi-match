import { z } from 'zod';

import { CoreV2EventEnvelopeSchema } from './events';

export { CoreV2EventEnvelopeSchema } from './events';
export type { CoreV2EventEnvelope } from './events';

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
