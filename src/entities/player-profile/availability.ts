import { z } from 'zod';

import { TIME_PREFERENCE_CATALOG } from './catalogs';
import {
  DayOfWeekSchema,
  RecurringAvailabilitySchema,
  TimePreferenceIdSchema,
  TimezoneSchema,
  type AvailabilityDayOfWeek,
  type AvailabilitySlot,
  type RecurringAvailability,
} from './schemas';

const MINUTES_PER_DAY = 24 * 60;
const DAYS: readonly AvailabilityDayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

type Interval = { endMinute: number; startMinute: number };

const BuildRecurringAvailabilityInputSchema = z.object({
  daysOfWeek: z.array(DayOfWeekSchema).max(7),
  timePreferenceIds: z
    .array(TimePreferenceIdSchema)
    .max(TIME_PREFERENCE_CATALOG.length),
  timezone: TimezoneSchema,
});

export type BuildRecurringAvailabilityInput = z.infer<
  typeof BuildRecurringAvailabilityInputSchema
>;

/**
 * Expands stable time-preference IDs into explicit weekly slots.
 * Callers must provide weekdays and timezone; this primitive invents neither.
 */
export function buildRecurringAvailabilityFromTimePreferences(
  input: BuildRecurringAvailabilityInput,
): RecurringAvailability {
  const canonical = BuildRecurringAvailabilityInputSchema.parse(input);
  const uniqueDays = [...new Set(canonical.daysOfWeek)];
  const uniquePreferences = [...new Set(canonical.timePreferenceIds)];
  const slots = uniqueDays.flatMap((dayOfWeek) =>
    uniquePreferences.map((preferenceId) => {
      const option = TIME_PREFERENCE_CATALOG.find(
        (candidate) => candidate.id === preferenceId,
      );
      if (!option) {
        throw new Error(`Unknown time preference ID: ${preferenceId}`);
      }
      return {
        dayOfWeek,
        endMinute: option.window.endMinute,
        startMinute: option.window.startMinute,
      } satisfies AvailabilitySlot;
    }),
  );

  return normalizeRecurringAvailability({
    slots,
    timezone: canonical.timezone,
  });
}

/** Splits overnight slots, deduplicates, and merges overlapping/adjacent ranges. */
export function normalizeRecurringAvailability(
  input: RecurringAvailability,
): RecurringAvailability {
  const canonical = RecurringAvailabilitySchema.parse(input);
  const intervalsByDay = new Map<AvailabilityDayOfWeek, Interval[]>(
    DAYS.map((day) => [day, []]),
  );

  for (const slot of canonical.slots) {
    if (slot.endMinute > slot.startMinute) {
      intervalsByDay.get(slot.dayOfWeek)?.push({
        endMinute: slot.endMinute,
        startMinute: slot.startMinute,
      });
      continue;
    }

    intervalsByDay.get(slot.dayOfWeek)?.push({
      endMinute: MINUTES_PER_DAY,
      startMinute: slot.startMinute,
    });
    if (slot.endMinute > 0) {
      intervalsByDay.get(nextDay(slot.dayOfWeek))?.push({
        endMinute: slot.endMinute,
        startMinute: 0,
      });
    }
  }

  const slots = DAYS.flatMap((dayOfWeek) =>
    mergeIntervals(intervalsByDay.get(dayOfWeek) ?? []).map((interval) => ({
      dayOfWeek,
      ...interval,
    })),
  );

  return RecurringAvailabilitySchema.parse({
    slots,
    timezone: canonical.timezone,
  });
}

export type LegacyAvailabilitySlot = {
  day_of_week: AvailabilityDayOfWeek;
  ends_at: string;
  starts_at: string;
};

/** Current SQL uses `time`, so midnight end is represented as 23:59:59. */
export function toLegacyAvailabilitySlots(
  availability: RecurringAvailability,
): LegacyAvailabilitySlot[] {
  return normalizeRecurringAvailability(availability).slots.map((slot) => ({
    day_of_week: slot.dayOfWeek,
    ends_at: formatLegacyTime(slot.endMinute, true),
    starts_at: formatLegacyTime(slot.startMinute, false),
  }));
}

function mergeIntervals(intervals: readonly Interval[]) {
  const sorted = [...intervals].sort(
    (left, right) =>
      left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  );
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const current = merged.at(-1);
    if (!current || interval.startMinute > current.endMinute) {
      merged.push({ ...interval });
      continue;
    }
    current.endMinute = Math.max(current.endMinute, interval.endMinute);
  }

  return merged;
}

function nextDay(day: AvailabilityDayOfWeek): AvailabilityDayOfWeek {
  return ((day + 1) % 7) as AvailabilityDayOfWeek;
}

function formatLegacyTime(minute: number, isEnd: boolean) {
  if (isEnd && minute === MINUTES_PER_DAY) return '23:59:59';
  const bounded = Math.max(0, Math.min(minute, MINUTES_PER_DAY - 1));
  const hours = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}
