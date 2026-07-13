import { describe, expect, it } from '@jest/globals';

import {
  buildRecurringAvailabilityFromTimePreferences,
  normalizeRecurringAvailability,
  toLegacyAvailabilitySlots,
} from '../availability';

describe('recurring availability', () => {
  it('requires explicit weekdays and timezone and invents no fallback', () => {
    expect(
      buildRecurringAvailabilityFromTimePreferences({
        daysOfWeek: [],
        timePreferenceIds: [],
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    ).toEqual({ slots: [], timezone: 'Asia/Ho_Chi_Minh' });

    expect(() =>
      buildRecurringAvailabilityFromTimePreferences({
        daysOfWeek: [1],
        timePreferenceIds: ['time.evening'],
        timezone: 'not/a-timezone',
      }),
    ).toThrow();
  });

  it('deduplicates days and adjacent time preferences', () => {
    const availability = buildRecurringAvailabilityFromTimePreferences({
      daysOfWeek: [1, 1],
      timePreferenceIds: [
        'time.morning',
        'time.midday',
        'time.afternoon',
        'time.afternoon',
      ],
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(availability.slots).toEqual([
      { dayOfWeek: 1, startMinute: 360, endMinute: 1080 },
    ]);
  });

  it('merges overlapping intervals and preserves separate ranges', () => {
    const normalized = normalizeRecurringAvailability({
      slots: [
        { dayOfWeek: 2, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 2, startMinute: 600, endMinute: 780 },
        { dayOfWeek: 2, startMinute: 900, endMinute: 960 },
      ],
      timezone: 'UTC',
    });

    expect(normalized.slots).toEqual([
      { dayOfWeek: 2, startMinute: 540, endMinute: 780 },
      { dayOfWeek: 2, startMinute: 900, endMinute: 960 },
    ]);
  });

  it('splits overnight ranges across the next weekday including week wrap', () => {
    const availability = buildRecurringAvailabilityFromTimePreferences({
      daysOfWeek: [6],
      timePreferenceIds: ['time.late-night'],
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(availability.slots).toEqual([
      { dayOfWeek: 0, startMinute: 0, endMinute: 180 },
      { dayOfWeek: 6, startMinute: 1320, endMinute: 1440 },
    ]);
  });

  it('converts canonical slots to the current SQL time representation', () => {
    expect(
      toLegacyAvailabilitySlots({
        slots: [
          { dayOfWeek: 5, startMinute: 1080, endMinute: 1440 },
          { dayOfWeek: 6, startMinute: 0, endMinute: 180 },
        ],
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    ).toEqual([
      {
        day_of_week: 5,
        starts_at: '18:00:00',
        ends_at: '23:59:59',
      },
      {
        day_of_week: 6,
        starts_at: '00:00:00',
        ends_at: '03:00:00',
      },
    ]);
  });
});
