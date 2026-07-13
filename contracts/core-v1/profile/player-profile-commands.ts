import { z } from 'zod';
import { AuthenticatedPrincipalV1Schema } from '../identity/authenticated-principal';
import { IdempotencyKeySchema } from '../identity/semantic-ids';
import { PlayerLifecycleSnapshotV1Schema } from '../lifecycle/player-lifecycle';

const CatalogSlugSchema = z
  .string()
  .regex(/^[a-z0-9_]+$/)
  .max(80);

export const MinimumActiveProfileV1Schema = z.object({
  displayName: z.string().trim().min(2).max(40),
  gameHandle: z.string().trim().min(2).max(64),
  rankSlug: CatalogSlugSchema,
  roleSlugs: z
    .array(CatalogSlugSchema)
    .min(1)
    .max(2)
    .refine((values) => new Set(values).size === values.length, {
      message: 'roleSlugs must be unique',
    }),
  favoriteHeroSlugs: z
    .array(CatalogSlugSchema)
    .length(3)
    .refine((values) => new Set(values).size === values.length, {
      message: 'favoriteHeroSlugs must be unique',
    }),
  timezone: z.string().trim().min(1).max(80),
});

export const CompletePlayerOnboardingCommandV1Schema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  expectedProfileVersion: z.number().int().nonnegative(),
  profile: MinimumActiveProfileV1Schema,
  /** Expand/migrate bridge only; lifecycle activation is verified from persisted canonical fields. */
  legacyProfilePayload: z.record(z.string(), z.unknown()),
});

export const CompletePlayerOnboardingResultV1Schema = z.object({
  principal: AuthenticatedPrincipalV1Schema,
  lifecycle: PlayerLifecycleSnapshotV1Schema,
  profileVersion: z.number().int().positive(),
  repeated: z.boolean(),
});

export type MinimumActiveProfileV1 = z.infer<
  typeof MinimumActiveProfileV1Schema
>;
export type CompletePlayerOnboardingCommandV1 = z.infer<
  typeof CompletePlayerOnboardingCommandV1Schema
>;
export type CompletePlayerOnboardingResultV1 = z.infer<
  typeof CompletePlayerOnboardingResultV1Schema
>;
