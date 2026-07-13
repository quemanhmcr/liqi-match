import { z } from 'zod';
import { MatchIntentIdSchema, PlayerIdSchema } from '../identity/semantic-ids';

export const MatchIntentStateV1Schema = z.enum([
  'inactive',
  'active',
  'paused',
  'fulfilled',
  'expired',
]);

export const MatchIntentKindV1Schema = z.enum([
  'normal',
  'rank',
  'team_rank',
  'set_love',
  'soulmate',
]);

export const MatchIntentFiltersV1Schema = z.object({
  intentKind: MatchIntentKindV1Schema.optional(),
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

export const ActivateMatchIntentReceiptV1Schema =
  MatchIntentSnapshotV1Schema.extend({
    repeated: z.boolean(),
  });

export const ActivateMatchIntentCommandV1Schema = z.object({
  filters: MatchIntentFiltersV1Schema,
  idempotencyKey: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive().optional(),
});

export const PauseMatchIntentCommandV1Schema = z.object({
  idempotencyKey: z.string().min(16).max(200),
  expectedVersion: z.number().int().positive(),
});

export const PauseMatchIntentReceiptV1Schema =
  MatchIntentSnapshotV1Schema.extend({
    repeated: z.boolean(),
  });

export type MatchIntentKindV1 = z.infer<typeof MatchIntentKindV1Schema>;
export type MatchIntentFiltersV1 = z.infer<typeof MatchIntentFiltersV1Schema>;
export type MatchIntentSnapshotV1 = z.infer<typeof MatchIntentSnapshotV1Schema>;
export type ActivateMatchIntentCommandV1 = z.infer<
  typeof ActivateMatchIntentCommandV1Schema
>;

export type ActivateMatchIntentReceiptV1 = z.infer<
  typeof ActivateMatchIntentReceiptV1Schema
>;
export type PauseMatchIntentCommandV1 = z.infer<
  typeof PauseMatchIntentCommandV1Schema
>;
export type PauseMatchIntentReceiptV1 = z.infer<
  typeof PauseMatchIntentReceiptV1Schema
>;
