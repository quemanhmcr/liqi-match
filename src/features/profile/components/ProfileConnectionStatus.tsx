import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import {
  liqiColors,
  liqiComponentColors,
  liqiRadius,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import type { ProfileViewModel } from '../services/profile-service';
import { ProfileSurface } from './ProfilePresentationPrimitives';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

export function ProfileConnectionStatus({
  compact,
  onShare,
  profile,
}: {
  compact: boolean;
  onShare?: () => void;
  profile: ProfileViewModel;
}) {
  return (
    <ProfileSurface compact={compact}>
      <ProfileSectionHeader
        accessibilityLabel="Chia sẻ hồ sơ"
        compact={compact}
        icon="heart"
        onPress={onShare}
        title="Trạng thái kết nối"
        withChevron={Boolean(onShare)}
      />
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: statusColor(profile.statusValue) },
          ]}
        />
        <ProfileText style={styles.statusText}>
          {profile.statusLabel} · {statusDetail(profile.statusValue)}
        </ProfileText>
      </View>
      <View style={styles.bioRow}>
        <View style={styles.bioIcon}>
          <Ionicons
            color={liqiComponentColors.profile.interestIcon}
            name="heart-outline"
            size={15}
          />
        </View>
        <ProfileText numberOfLines={2} style={styles.bio}>
          {profile.bio}
        </ProfileText>
      </View>
    </ProfileSurface>
  );
}

function statusColor(status: ProfileViewModel['statusValue']) {
  switch (status) {
    case 'ready':
      return liqiColors.status.online;
    case 'busy':
      return liqiColors.status.warning;
    case 'friends':
      return liqiColors.accent.purple;
    case 'offline':
      return liqiColors.text.disabled;
  }
}

function statusDetail(status: ProfileViewModel['statusValue']) {
  switch (status) {
    case 'ready':
      return 'Sẵn sàng kết nối';
    case 'busy':
      return 'Đang bận';
    case 'offline':
      return 'Đang ngoại tuyến';
    case 'friends':
      return 'Ưu tiên bạn bè';
  }
}

const styles = StyleSheet.create({
  bio: {
    ...liqiTypography.body,
    color: liqiColors.text.secondary,
    flex: 1,
    minWidth: 0,
  },
  bioIcon: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.statusSurface,
    borderRadius: liqiRadius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  bioRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.lg,
    marginTop: liqiSpacing.md,
  },
  statusDot: {
    borderRadius: liqiRadius.pill,
    height: 9,
    width: 9,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.lg,
    marginTop: liqiSpacing.xl,
  },
  statusText: {
    ...liqiTypography.body,
    color: liqiColors.text.secondary,
    flex: 1,
  },
});
