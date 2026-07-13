import { View } from 'react-native';

import { LiquidChip } from '@/shared/components/liquid';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileEditForm } from '../model/profile-edit-model';
import { ProfileEditSection } from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

export function AvailabilitySection({
  availability,
}: {
  availability: ProfileEditForm['availability'];
}) {
  const presets = availability.presets ?? [];
  return (
    <ProfileEditSection
      icon="calendar-outline"
      subtitle="Chỉ đọc cho đến khi primitive availability chung được merge. Profile Edit không tự sao chép catalog hoặc logic recurring slots."
      title="Thời gian chơi"
    >
      {presets.length ? (
        <View style={styles.chipWrap}>
          {presets.map((preset) => (
            <LiquidChip
              accessibilityLabel={`Khung giờ hiện tại ${preset}`}
              density="compact"
              disabled
              key={preset}
              selected
              textStyle={styles.chipText}
              variant="purple"
            >
              {preset}
            </LiquidChip>
          ))}
        </View>
      ) : (
        <ProfileText style={styles.errorText}>
          Chưa có availability. Field này sẽ không được tự điền hoặc lưu bằng
          logic tạm.
        </ProfileText>
      )}
    </ProfileEditSection>
  );
}
