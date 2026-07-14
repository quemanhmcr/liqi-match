import { z } from 'zod';
import { AuthenticatedPrincipalV1Schema } from '../identity/authenticated-principal';
import {
  IdempotencyKeySchema,
  PlayerIdSchema,
  ProfileIdSchema,
} from '../identity/semantic-ids';
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

export const PlayerProfileStatusV1Schema = z.enum([
  'ready',
  'busy',
  'offline',
  'friends',
]);

export const PlayerProfileIdentityV1Schema = z
  .object({
    bio: z.string().max(80),
    displayName: z.string().trim().min(2).max(40),
    genderId: z.enum(['male', 'female', 'hidden']).nullable(),
    stats: z
      .object({
        matches: z.number().int().min(0).max(99_999),
        rating: z.number().min(0).max(5),
        reputation: z.number().int().min(0).max(100),
        winRate: z.number().int().min(0).max(100),
      })
      .strict(),
    status: PlayerProfileStatusV1Schema.nullable(),
  })
  .strict();

export const UpdatePlayerProfileIdentityCommandV1Schema = z
  .object({
    expectedProfileVersion: z.number().int().nonnegative(),
    idempotencyKey: IdempotencyKeySchema,
    identity: PlayerProfileIdentityV1Schema,
  })
  .strict();

export const PlayerProfileIdentitySnapshotV1Schema = z
  .object({
    identity: PlayerProfileIdentityV1Schema,
    playerId: PlayerIdSchema,
    profileId: ProfileIdSchema,
    profileVersion: z.number().int().positive(),
  })
  .strict();

export const UpdatePlayerProfileIdentityResultV1Schema =
  PlayerProfileIdentitySnapshotV1Schema.extend({
    repeated: z.boolean(),
  }).strict();

export type PlayerProfileIdentitySnapshotV1 = z.infer<
  typeof PlayerProfileIdentitySnapshotV1Schema
>;
export type PlayerProfileIdentityV1 = z.infer<
  typeof PlayerProfileIdentityV1Schema
>;
export type PlayerProfileStatusV1 = z.infer<typeof PlayerProfileStatusV1Schema>;
export type UpdatePlayerProfileIdentityCommandV1 = z.infer<
  typeof UpdatePlayerProfileIdentityCommandV1Schema
>;
export type UpdatePlayerProfileIdentityResultV1 = z.infer<
  typeof UpdatePlayerProfileIdentityResultV1Schema
>;
