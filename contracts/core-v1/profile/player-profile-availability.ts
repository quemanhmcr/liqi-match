import { z } from 'zod';

import {
  IdempotencyKeySchema,
  PlayerIdSchema,
  ProfileIdSchema,
} from '../identity/semantic-ids';

export const ProfileAvailabilityTimezoneV1Schema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((timezone) => {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Timezone must be a valid IANA timezone.');

export const ProfileAvailabilitySlotV1Schema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    endMinute: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 - 1),
  })
  .strict()
  .superRefine((slot, context) => {
    if (slot.endMinute <= slot.startMinute) {
      context.addIssue({
        code: 'custom',
        message: 'Canonical availability slots cannot be empty or overnight.',
        path: ['endMinute'],
      });
    }
  });

export const PlayerProfileAvailabilityV1Schema = z
  .object({
    slots: z
      .array(ProfileAvailabilitySlotV1Schema)
      .min(1)
      .max(7 * 12),
    timezone: ProfileAvailabilityTimezoneV1Schema,
  })
  .strict()
  .superRefine((availability, context) => {
    const sorted = availability.slots
      .map((slot, index) => ({ ...slot, index }))
      .sort(
        (left, right) =>
          left.dayOfWeek - right.dayOfWeek ||
          left.startMinute - right.startMinute ||
          left.endMinute - right.endMinute,
      );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous || !current) continue;
      if (
        previous.dayOfWeek === current.dayOfWeek &&
        current.startMinute < previous.endMinute
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Canonical availability slots cannot overlap.',
          path: ['slots', current.index],
        });
      }
    }
  });

export const PlayerProfileAvailabilitySnapshotV1Schema = z
  .object({
    availability: PlayerProfileAvailabilityV1Schema.nullable(),
    playerId: PlayerIdSchema,
    profileId: ProfileIdSchema,
    profileVersion: z.number().int().nonnegative(),
  })
  .strict();

export const UpdatePlayerProfileAvailabilityCommandV1Schema = z
  .object({
    availability: PlayerProfileAvailabilityV1Schema.nullable(),
    expectedProfileVersion: z.number().int().nonnegative(),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const UpdatePlayerProfileAvailabilityResultV1Schema =
  PlayerProfileAvailabilitySnapshotV1Schema.extend({
    repeated: z.boolean(),
  }).strict();

export type PlayerProfileAvailabilityV1 = z.infer<
  typeof PlayerProfileAvailabilityV1Schema
>;
export type PlayerProfileAvailabilitySnapshotV1 = z.infer<
  typeof PlayerProfileAvailabilitySnapshotV1Schema
>;
export type UpdatePlayerProfileAvailabilityCommandV1 = z.infer<
  typeof UpdatePlayerProfileAvailabilityCommandV1Schema
>;
export type UpdatePlayerProfileAvailabilityResultV1 = z.infer<
  typeof UpdatePlayerProfileAvailabilityResultV1Schema
>;
