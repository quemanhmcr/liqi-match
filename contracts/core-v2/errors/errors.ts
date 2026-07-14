import { z } from 'zod';

export const CoreV2ErrorCodeSchema = z.enum([
  'unauthenticated',
  'player_lifecycle_forbidden',
  'conversation_not_found',
  'conversation_access_revoked',
  'conversation_tombstoned',
  'conversation_version_conflict',
  'conversation_source_conflict',
  'source_version_conflict',
  'membership_required',
  'message_not_found',
  'message_idempotency_conflict',
  'read_cursor_regression',
  'read_cursor_ahead',
  'unsupported_event_version',
  'event_replay_conflict',
  'validation_failed',
]);
export type CoreV2ErrorCode = z.infer<typeof CoreV2ErrorCodeSchema>;

export const CoreV2ErrorSchema = z
  .object({
    code: CoreV2ErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CoreV2Error = z.infer<typeof CoreV2ErrorSchema>;
