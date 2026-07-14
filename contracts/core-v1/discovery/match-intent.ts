import { z } from 'zod';
import { MatchIntentIdSchema, PlayerIdSchema } from '../identity/semantic-ids';

export const MatchIntentStateV1Schema = z.enum([
  'inactive',
  'active',
  'paused',
  'fulfilled',
  'expired',
]);

export const MatchIntentFiltersV1Schema = z.object({
  mode: z.enum(['normal', 'ranked']),
  partyFormat: z.enum(['duo', 'full_team', 'flex']),
  sessionPlan: z.enum(['quick', 'long']),
  roleSlugs: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(2),
  timezone: z.string().min(1).max(64),
});

export const MatchIntentSnapshotV1Schema = z.object({
  matchIntentId: MatchIntentIdSchema,
  playerId: PlayerIdSchema,
  state: MatchIntentStateV1Schema,
  filters: MatchIntentFiltersV1Schema,
  version: z.number().int().positive(),
  activatedAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export const ActivateMatchIntentCommandV1Schema = z.object({
  filters: MatchIntentFiltersV1Schema,
  idempotencyKey: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive().optional(),
});

export type MatchIntentFiltersV1 = z.infer<typeof MatchIntentFiltersV1Schema>;
export type MatchIntentSnapshotV1 = z.infer<typeof MatchIntentSnapshotV1Schema>;
export type ActivateMatchIntentCommandV1 = z.infer<
  typeof ActivateMatchIntentCommandV1Schema
>;
