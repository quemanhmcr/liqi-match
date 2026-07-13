import type { ProfileEditForm } from '../model/profile-edit-model';
import {
  ProfileEditSection,
  ProfileEditStringMultiGroup,
} from './ProfileEditPrimitives';

const temporaryAvailabilityOptions = [
  'Sáng',
  'Trưa',
  'Chiều',
  'Tối',
  'Khuya',
] as const;

export function AvailabilitySection({
  availability,
  onChange,
  onLimitReached,
}: {
  availability: ProfileEditForm['availability'];
  onChange: (availability: ProfileEditForm['availability']) => void;
  onLimitReached: () => void;
}) {
  return (
    <ProfileEditSection
      icon="calendar-outline"
      subtitle="Hiện chỉ cập nhật preset đã tồn tại. Recurring slots sẽ dùng primitive chung sau khi contract được merge."
      title="Thời gian chơi"
    >
      <ProfileEditStringMultiGroup
        label="Khung giờ thường chơi"
        limit={5}
        onToggle={(value) => {
          const current = availability.presets ?? [];
          if (current.includes(value)) {
            onChange({ presets: current.filter((item) => item !== value) });
            return;
          }
          if (current.length >= 5) {
            onLimitReached();
            return;
          }
          onChange({ presets: [...current, value] });
        }}
        options={temporaryAvailabilityOptions}
        selected={availability.presets}
      />
    </ProfileEditSection>
  );
}
