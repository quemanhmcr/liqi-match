import {
  TIME_PREFERENCE_CATALOG,
  buildRecurringAvailabilityFromTimePreferences,
  type AvailabilityDayOfWeek,
} from '@/entities/player-profile';

import type { ProfileEditForm } from '../model/profile-edit-model';

export const profileEditDayOptions: readonly {
  id: AvailabilityDayOfWeek;
  label: string;
}[] = [
  { id: 1, label: 'T2' },
  { id: 2, label: 'T3' },
  { id: 3, label: 'T4' },
  { id: 4, label: 'T5' },
  { id: 5, label: 'T6' },
  { id: 6, label: 'T7' },
  { id: 0, label: 'CN' },
];

export function profileEditMediaPreviewUrl(
  item: ProfileEditForm['media']['staged']['avatar'] | undefined,
  fallback: string | undefined,
) {
  if (item?.uploadedAssetId) return fallback;
  return item?.asset.uri ?? fallback;
}

export function profileEditMediaStatusLabel(status: string) {
  if (status === 'ready') return 'Sẵn sàng upload khi lưu';
  if (status === 'uploading') return 'Đang upload';
  if (status === 'uploaded') return 'Chờ liên kết';
  if (status === 'associated') return 'Đã liên kết';
  if (status === 'failed') return 'Cần chọn lại';
  return 'Đã chọn';
}

export function inferProfileEditSelectedDays(
  availability: ProfileEditForm['availability'],
) {
  if (!availability) return [];
  return profileEditDayOptions
    .map((option) => option.id)
    .filter((day) => availability.slots.some((slot) => slot.dayOfWeek === day));
}

export function inferProfileEditSelectedPreferences(
  availability: ProfileEditForm['availability'],
) {
  if (!availability) return [];
  return TIME_PREFERENCE_CATALOG.filter((option) =>
    profileEditDayOptions.some((day) => {
      const expected = buildRecurringAvailabilityFromTimePreferences({
        daysOfWeek: [day.id],
        timePreferenceIds: [option.id],
        timezone: availability.timezone,
      });
      return expected.slots.every((slot) =>
        availability.slots.some(
          (candidate) =>
            candidate.dayOfWeek === slot.dayOfWeek &&
            candidate.startMinute <= slot.startMinute &&
            candidate.endMinute >= slot.endMinute,
        ),
      );
    }),
  ).map((option) => option.id);
}

export function profileEditDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
  } catch {
    return 'Asia/Bangkok';
  }
}

export function profileEditDayLabel(day: number) {
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][day] ?? `Ngày ${day}`;
}

export function profileEditFormatMinute(minute: number) {
  if (minute === 24 * 60) return '24:00';
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
