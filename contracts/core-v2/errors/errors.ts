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
  'message_not_found',
  'message_idempotency_conflict',
  'read_cursor_regression',
  'read_cursor_ahead',
  'unsupported_event_version',
  'event_replay_conflict',
  'session_expired',
  'forbidden',
  'validation_failed',
  'not_found',
  'lifecycle_not_active',
  'relationship_blocked',
  'invitation_not_allowed',
  'capacity_exceeded',
  'version_conflict',
  'idempotency_key_reused',
  'invalid_transition',
  'owner_transfer_required',
  'membership_required',
  'ready_check_not_open',
  'ready_check_expired',
  'ready_policy_not_satisfied',
  'schedule_policy_not_satisfied',
  'completion_policy_not_satisfied',
  'conversation_pending',
  'feature_disabled',
  'rate_limited',
  'service_unavailable',
  'internal_error',
]);

export const CoreV2ErrorSchema = z
  .object({
    code: CoreV2ErrorCodeSchema,
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string().min(1),
    requestId: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export type CoreV2ErrorCode = z.infer<typeof CoreV2ErrorCodeSchema>;
export type CoreV2Error = z.infer<typeof CoreV2ErrorSchema>;
