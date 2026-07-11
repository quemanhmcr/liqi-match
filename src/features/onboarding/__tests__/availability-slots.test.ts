import { describe, expect, it } from '@jest/globals';

import { buildRecurringAvailabilitySlots } from '@/features/onboarding/model/availability-slots';

describe('buildRecurringAvailabilitySlots', () => {
  it('repeats a selected time preset across all seven local weekdays', () => {
    const slots = buildRecurringAvailabilitySlots(['Tối']);

    expect(slots).toHaveLength(7);
    expect(slots.map((slot) => slot.day_of_week)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(slots).toEqual(
      expect.arrayContaining([
        { day_of_week: 0, starts_at: '18:00:00', ends_at: '23:59:59' },
        { day_of_week: 6, starts_at: '18:00:00', ends_at: '23:59:59' },
      ]),
    );
  });

  it('merges adjacent daytime presets into one stable slot per day', () => {
    const slots = buildRecurringAvailabilitySlots(['Sáng', 'Trưa', 'Chiều']);

    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual({
      day_of_week: 0,
      starts_at: '06:00:00',
      ends_at: '18:00:00',
    });
  });

  it('splits an overnight preset at midnight for every day', () => {
    const slots = buildRecurringAvailabilitySlots(['Khuya']);
    const sunday = slots.filter((slot) => slot.day_of_week === 0);

    expect(slots).toHaveLength(14);
    expect(sunday).toEqual([
      { day_of_week: 0, starts_at: '00:00:00', ends_at: '03:00:00' },
      { day_of_week: 0, starts_at: '22:00:00', ends_at: '23:59:59' },
    ]);
  });

  it('deduplicates repeated presets and returns no invented fallback', () => {
    expect(buildRecurringAvailabilitySlots(['Tối', 'Tối'])).toHaveLength(7);
    expect(buildRecurringAvailabilitySlots([])).toEqual([]);
  });
});
