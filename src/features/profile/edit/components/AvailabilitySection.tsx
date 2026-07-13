import { View } from 'react-native';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileEditForm } from '../model/profile-edit-model';
import { ProfileEditSection } from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

export function AvailabilitySection({
  availability,
}: {
  availability: ProfileEditForm['availability'];
}) {
  return (
    <ProfileEditSection
      icon="calendar-outline"
      subtitle="Đang hiển thị recurring availability canonical. Chỉnh sửa sẽ bật sau khi onboarding và Profile Edit dùng cùng primitive ghi dữ liệu."
      title="Thời gian chơi"
    >
      <View style={styles.notice}>
        <ProfileText style={styles.noticeTitle}>Tạm thời chỉ xem</ProfileText>
        <ProfileText style={styles.errorText}>
          Profile Edit không tạo payload availability riêng hoặc giả lập dữ liệu
          đã persist.
        </ProfileText>
      </View>
      {!availability ? (
        <ProfileText style={styles.errorText}>
          Chưa có lịch chơi hợp lệ trên server.
        </ProfileText>
      ) : (
        <>
          <ProfileText style={styles.fieldLabel}>
            Múi giờ · {availability.timezone}
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
        </>
      )}
    </ProfileEditSection>
  );
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
