import { View } from 'react-native';

import { LiqiButton } from '@/shared/components/liqi';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileEditSaveResult } from '../services/profile-edit-coordinator';
import { profileEditStyles as styles } from './profile-edit-styles';

export function ProfileEditSaveBanner({
  onRetry,
  result,
}: {
  onRetry: () => void;
  result: ProfileEditSaveResult;
}) {
  const failed = result.steps.find(
    (step) => step.status === 'failed' || step.status === 'partially-saved',
  );
  return (
    <View accessibilityLabel="Trạng thái lưu hồ sơ" style={styles.saveBanner}>
      <ProfileText style={styles.saveBannerTitle}>
        {result.outcome === 'partially-saved'
          ? 'Hồ sơ đã được lưu một phần'
          : 'Chưa lưu được thay đổi'}
      </ProfileText>
      <ProfileText style={styles.errorText}>
        {failed?.error ??
          'Có lỗi ở một bước cập nhật. Các bước phụ thuộc đã dừng.'}
      </ProfileText>
      {result.uploadedButUnassociated.length ? (
        <ProfileText style={styles.errorText}>
          {result.uploadedButUnassociated.length} ảnh đã upload nhưng chưa liên
          kết. Retry sẽ dùng lại asset hiện có, không upload lại.
        </ProfileText>
      ) : null}
      {result.retrySections.length ? (
        <LiqiButton
          accessibilityLabel="Thử lưu lại phần thất bại"
          onPress={onRetry}
          radius={18}
          style={styles.retryButton}
          withShadow={false}
        >
          <ProfileText style={styles.primaryMiniText}>Thử lại</ProfileText>
        </LiqiButton>
      ) : null}
    </View>
  );
}
