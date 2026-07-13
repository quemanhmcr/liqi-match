/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
import { z } from 'zod';

/**Authenticated monotonic read-watermark command.*/
export const AdvanceReadCommandV1Schema = z
  .object({
    /**ConversationId.*/
    conversationId: z.string().min(1).max(128).describe('ConversationId.'),
    lastReadSequence: z.number().int().gte(0),
    /**Cross-mission correlation identifier.*/
    correlationId: z
      .string()
      .min(1)
      .max(128)
      .describe('Cross-mission correlation identifier.'),
  })
  .strict()
  .describe('Authenticated monotonic read-watermark command.');
export type AdvanceReadCommandV1 = z.infer<typeof AdvanceReadCommandV1Schema>;
