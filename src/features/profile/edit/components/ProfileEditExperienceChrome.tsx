import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import {
  AppActionDock,
  AppButton,
  AppCard,
  AppIdentityHeader,
  AppText,
  appColors,
  isCompactViewport,
} from '@/shared/ui';

import { profileEditExperienceStyles as styles } from './profile-edit-experience.styles';

export function ProfileEditHeader({
  hasChanges,
  onBack,
}: Readonly<{
  hasChanges: boolean;
  onBack: () => void;
}>) {
  const { width } = useWindowDimensions();
  return (
    <AppIdentityHeader
      compact={isCompactViewport(width)}
      leadingAction={{
        accessibilityLabel: 'Quay lại hồ sơ',
        icon: 'chevron-back',
        onPress: onBack,
      }}
      online={false}
      presentation="page"
      subtitle="Chỉnh theo từng nhóm; hệ thống chỉ gửi những phần thực sự thay đổi."
      title="Chỉnh sửa hồ sơ"
      titleAccessory={hasChanges ? <View style={styles.dirtyDot} /> : undefined}
    />
  );
}

export function ProfileEditSaveDock({
  canSave,
  dirtyCount,
  loading,
  onSave,
}: Readonly<{
  canSave: boolean;
  dirtyCount: number;
  loading: boolean;
  onSave: () => void;
}>) {
  return (
    <AppActionDock
      contentStyle={styles.saveDockContent}
      testID="profile-edit-save-dock"
    >
      <View style={styles.saveDockCopy}>
        <AppText tone={dirtyCount ? 'primary' : 'muted'} variant="label">
          {dirtyCount ? `${dirtyCount} phần đã thay đổi` : 'Chưa có thay đổi'}
        </AppText>
        <AppText numberOfLines={1} tone="muted" variant="caption">
          Social stats và uy tín không thể tự chỉnh.
        </AppText>
      </View>
      <AppButton
        accessibilityLabel="Lưu hồ sơ"
        disabled={!canSave}
        emphasis={canSave ? 'medium' : 'none'}
        onPress={onSave}
        style={styles.saveDockButton}
        variant={canSave ? 'primary' : 'ghost'}
        withShadow={false}
      >
        {loading ? (
          <ActivityIndicator color={appColors.text.onAccent} size="small" />
        ) : (
          <Ionicons
            color={canSave ? appColors.text.onAccent : appColors.text.muted}
            name="checkmark-circle-outline"
            size={18}
          />
        )}
        <AppText tone={canSave ? 'primary' : 'muted'} variant="button">
          {loading ? 'Đang lưu' : 'Lưu'}
        </AppText>
      </AppButton>
    </AppActionDock>
  );
}

export function ProfileEditLoadingState() {
  return (
    <AppCard contentStyle={styles.stateCard} withShadow={false}>
      <ActivityIndicator color={appColors.accent.purpleIcon} size="large" />
      <AppText variant="h2">Đang tải hồ sơ</AppText>
      <AppText style={styles.centerText} tone="secondary" variant="bodySmall">
        Đang đọc bản profile version mới nhất và khôi phục ảnh nháp nếu có.
      </AppText>
    </AppCard>
  );
}

export function ProfileEditErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <AppCard contentStyle={styles.stateCard} withShadow={false}>
      <Ionicons
        color={appColors.status.warning}
        name="warning-outline"
        size={30}
      />
      <AppText variant="h2">Không tải được hồ sơ</AppText>
      <AppText style={styles.centerText} tone="secondary" variant="bodySmall">
        Dữ liệu chưa bị thay đổi. Kiểm tra kết nối rồi tải lại bản chỉnh sửa.
      </AppText>
      <AppButton onPress={onRetry} variant="secondary" withShadow={false}>
        Thử lại
      </AppButton>
    </AppCard>
  );
}
