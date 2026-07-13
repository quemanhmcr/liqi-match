import { z } from 'zod';

export const CoreErrorCodeV1Schema = z.enum([
  'unauthenticated',
  'session_expired',
  'forbidden',
  'validation_failed',
  'not_found',
  'lifecycle_not_active',
  'player_not_found',
  'player_suspended',
  'player_deleting',
  'player_deleted',
  'profile_incomplete',
  'invalid_lifecycle_transition',
  'not_discoverable',
  'intent_not_active',
  'intent_version_conflict',
  'profile_version_conflict',
  'relationship_blocked',
  'idempotency_conflict',
  'idempotency_key_reused',
  'stale_cursor',
  'rate_limited',
  'service_unavailable',
  'internal_error',
]);

export const CoreErrorV1Schema = z.object({
  code: CoreErrorCodeV1Schema,
  message: z.string().min(1),
  requestId: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type CoreErrorCodeV1 = z.infer<typeof CoreErrorCodeV1Schema>;
export type CoreErrorV1 = z.infer<typeof CoreErrorV1Schema>;
