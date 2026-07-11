import { timePresetWindows, type TimePreset } from '../habit-options';

export type AvailabilityDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type AvailabilitySlotInput = {
  day_of_week: AvailabilityDayOfWeek;
  ends_at: string;
  starts_at: string;
};

type Interval = { endSecond: number; startSecond: number };

const DAYS: readonly AvailabilityDayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Projects coarse time-of-day habits into a recurring local weekly schedule.
 *
 * Onboarding currently does not ask for weekdays, so each selected preset is
 * repeated on all seven days. Overlapping/adjacent windows are merged and an
 * overnight preset is split because `availability_slots` cannot cross midnight.
 */
export function buildRecurringAvailabilitySlots(
  presets: readonly TimePreset[],
): AvailabilitySlotInput[] {
  const uniquePresets = [...new Set(presets)];
  if (!uniquePresets.length) return [];

  const intervalsByDay = new Map<AvailabilityDayOfWeek, Interval[]>(
    DAYS.map((day) => [day, []]),
  );

  for (const day of DAYS) {
    for (const preset of uniquePresets) {
      const window = timePresetWindows[preset];
      const startSecond = window.startMinute * 60;
      const endSecond = window.endMinute * 60;

      if (endSecond <= SECONDS_PER_DAY) {
        intervalsByDay.get(day)?.push({ endSecond, startSecond });
        continue;
      }

      intervalsByDay.get(day)?.push({
        endSecond: SECONDS_PER_DAY,
        startSecond,
      });
      intervalsByDay.get(nextDay(day))?.push({
        endSecond: endSecond - SECONDS_PER_DAY,
        startSecond: 0,
      });
    }
  }

  return DAYS.flatMap((day) =>
    mergeIntervals(intervalsByDay.get(day) ?? []).map((interval) => ({
      day_of_week: day,
      ends_at: formatTime(interval.endSecond, true),
      starts_at: formatTime(interval.startSecond, false),
    })),
  );
}

function mergeIntervals(intervals: readonly Interval[]) {
  const sorted = [...intervals].sort(
    (left, right) =>
      left.startSecond - right.startSecond || left.endSecond - right.endSecond,
  );
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const current = merged.at(-1);
    if (!current || interval.startSecond > current.endSecond) {
      merged.push({ ...interval });
      continue;
    }
    current.endSecond = Math.max(current.endSecond, interval.endSecond);
  }

  return merged;
}

function nextDay(day: AvailabilityDayOfWeek): AvailabilityDayOfWeek {
  return ((day + 1) % 7) as AvailabilityDayOfWeek;
}

function formatTime(totalSeconds: number, isEnd: boolean) {
  const boundedSeconds =
    isEnd && totalSeconds >= SECONDS_PER_DAY
      ? SECONDS_PER_DAY - 1
      : Math.max(0, Math.min(totalSeconds, SECONDS_PER_DAY - 1));
  const hours = Math.floor(boundedSeconds / 3600);
  const minutes = Math.floor((boundedSeconds % 3600) / 60);
  const seconds = boundedSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
