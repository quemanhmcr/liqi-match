import { useState } from 'react';
import { View } from 'react-native';

import {
  TIME_PREFERENCE_CATALOG,
  buildRecurringAvailabilityFromTimePreferences,
  type AvailabilityDayOfWeek,
  type RecurringAvailability,
  type TimePreferenceId,
} from '@/entities/player-profile';
import { LiqiChip } from '@/shared/components/liqi';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileEditForm } from '../model/profile-edit-model';
import {
  ProfileEditCatalogMultiGroup,
  ProfileEditFieldLabel,
  ProfileEditSection,
} from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

const DAY_OPTIONS: readonly {
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

export function AvailabilitySection({
  availability,
  onChange,
}: {
  availability: ProfileEditForm['availability'];
  onChange: (availability: ProfileEditForm['availability']) => void;
}) {
  const [selectedDays, setSelectedDays] = useState<AvailabilityDayOfWeek[]>(
    () => inferSelectedDays(availability),
  );
  const [selectedPreferences, setSelectedPreferences] = useState<
    TimePreferenceId[]
  >(() => inferSelectedPreferences(availability));
  const timezone = availability?.timezone ?? deviceTimezone();

  function updateSelection(
    days: AvailabilityDayOfWeek[],
    preferences: TimePreferenceId[],
  ) {
    setSelectedDays(days);
    setSelectedPreferences(preferences);
    if (!days.length || !preferences.length) {
      onChange(null);
      return;
    }
    onChange(
      buildRecurringAvailabilityFromTimePreferences({
        daysOfWeek: days,
        timePreferenceIds: preferences,
        timezone,
      }),
    );
  }

  return (
    <ProfileEditSection
      icon="calendar-outline"
      subtitle="Chọn ngày và khung giờ thường chơi. Dữ liệu được lưu theo múi giờ và profile version hiện tại."
      title="Thời gian chơi"
    >
      <ProfileEditFieldLabel label="Múi giờ" meta={timezone} />
      <ProfileEditCatalogMultiGroup
        label="Ngày trong tuần"
        limit={DAY_OPTIONS.length}
        onToggle={(day) =>
          updateSelection(toggleValue(selectedDays, day), selectedPreferences)
        }
        options={DAY_OPTIONS}
        selectedIds={selectedDays}
      />
      <ProfileEditCatalogMultiGroup
        label="Khung giờ"
        limit={TIME_PREFERENCE_CATALOG.length}
        onToggle={(preference) =>
          updateSelection(
            selectedDays,
            toggleValue(selectedPreferences, preference),
          )
        }
        options={TIME_PREFERENCE_CATALOG}
        selectedIds={selectedPreferences}
      />

      {availability ? (
        <View style={styles.notice}>
          <ProfileText style={styles.noticeTitle}>
            Lịch canonical sẽ được lưu
          </ProfileText>
          {availability.slots.map((slot, index) => (
            <ProfileText
              key={`${slot.dayOfWeek}-${slot.startMinute}-${slot.endMinute}-${index}`}
              style={styles.errorText}
            >
              {dayLabel(slot.dayOfWeek)} · {formatMinute(slot.startMinute)}–
              {formatMinute(slot.endMinute)}
            </ProfileText>
          ))}
        </View>
      ) : (
        <ProfileText style={styles.mutedText}>
          Chọn ít nhất một ngày và một khung giờ để tạo lịch chơi.
        </ProfileText>
      )}

      {(selectedDays.length > 0 || selectedPreferences.length > 0) && (
        <LiqiChip
          accessibilityLabel="Xóa lịch chơi"
          density="compact"
          onPress={() => updateSelection([], [])}
          textStyle={styles.chipText}
          variant="purple"
        >
          Xóa lịch
        </LiqiChip>
      )}
    </ProfileEditSection>
  );
}

function inferSelectedDays(availability: RecurringAvailability | null) {
  if (!availability) return [];
  return DAY_OPTIONS.map((option) => option.id).filter((day) =>
    availability.slots.some((slot) => slot.dayOfWeek === day),
  );
}

function inferSelectedPreferences(availability: RecurringAvailability | null) {
  if (!availability) return [];
  return TIME_PREFERENCE_CATALOG.filter((option) =>
    DAY_OPTIONS.some((day) => {
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

function toggleValue<T>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
  } catch {
    return 'Asia/Bangkok';
  }
}

function dayLabel(day: number) {
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][day] ?? `Ngày ${day}`;
}

function formatMinute(minute: number) {
  if (minute === 24 * 60) return '24:00';
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
