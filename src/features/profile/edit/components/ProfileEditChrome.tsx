import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import {
  LiquidButton,
  LiquidCard,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from '../../components/ProfileShared';
import { profileEditStyles as styles } from './profile-edit-styles';

export function ProfileEditTopBar({
  canSave,
  hasChanges,
  loading,
  onBack,
  onSave,
}: {
  canSave: boolean;
  hasChanges: boolean;
  loading: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại hồ sơ"
        glassIntensity="low"
        glowIntensity="low"
        onPress={onBack}
        size={42}
        style={styles.topOrb}
      >
        <Ionicons
          color={liquidColors.text.primary}
          name="chevron-back"
          size={20}
        />
      </LiquidOrbButton>
      <View style={styles.titleBlock}>
        <ProfileText style={styles.title}>Chỉnh sửa hồ sơ</ProfileText>
        <ProfileText numberOfLines={2} style={styles.subtitle}>
          Chỉ section thay đổi mới được gửi lên server.
        </ProfileText>
      </View>
      <LiquidButton
        accessibilityLabel="Lưu hồ sơ"
        disabled={!canSave}
        glowIntensity={canSave ? 'low' : 'none'}
        onPress={onSave}
        radius={18}
        style={styles.saveButton}
        variant={canSave ? 'primary' : 'ghost'}
        withShadow={false}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
        <ProfileText style={styles.saveText}>
          {loading ? 'Đang lưu' : 'Lưu'}
        </ProfileText>
      </LiquidButton>
      {hasChanges ? (
        <View pointerEvents="none" style={styles.dirtyDot} />
      ) : null}
    </View>
  );
}

export function ProfileEditLoadingState() {
  return (
    <View style={styles.loadingBox}>
      <ActivityIndicator color="#C679FF" />
      <ProfileText style={styles.mutedText}>Đang tải hồ sơ...</ProfileText>
    </View>
  );
}

export function ProfileEditErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <LiquidCard
      density="regular"
      glowIntensity="low"
      style={styles.sectionCard}
    >
      <View style={styles.errorState}>
        <Ionicons
          color="rgba(255,216,168,0.84)"
          name="warning-outline"
          size={22}
        />
        <ProfileText style={styles.errorTitle}>
          Không tải được hồ sơ
        </ProfileText>
        <ProfileText style={styles.errorBody}>
          Kiểm tra kết nối rồi thử lại. Dữ liệu chưa được thay đổi.
        </ProfileText>
        <LiquidButton
          onPress={onRetry}
          radius={18}
          style={styles.retryButton}
          withShadow={false}
        >
          <ProfileText style={styles.primaryMiniText}>Thử lại</ProfileText>
        </LiquidButton>
      </View>
    </LiquidCard>
  );
}
