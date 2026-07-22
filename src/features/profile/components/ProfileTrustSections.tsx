import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { PlayerTrustProjectionV2 } from '@/shared/contracts/core-v2';
import { AppCard, AppText, appColors, appSpacing } from '@/shared/ui';

import { presentTrustSummary } from '../model/profile-surface-presenter';
import { profileUi } from '../ui/profile-ui';
import { ProfileCardHeader } from './ProfileCardHeader';
import { ProfileSectionAction } from './ProfileSectionAction';

export function ProfileTrustSections({
  compact,
  failed = false,
  loading = false,
  onOpenTrust,
  projection,
}: Readonly<{
  compact: boolean;
  failed?: boolean;
  loading?: boolean;
  onOpenTrust?: () => void;
  projection?: PlayerTrustProjectionV2;
}>) {
  const trust = presentTrustSummary(projection);
  const sourceIconSize = compact ? 30 : 34;
  const sourceMeta = loading
    ? 'Đang kiểm tra nguồn dữ liệu'
    : failed
      ? 'Không thể xác minh nguồn dữ liệu lúc này'
      : trust.meta;
  const body = loading
    ? 'Đang tải các tín hiệu uy tín đã xác minh…'
    : failed
      ? 'Không thể tải dữ liệu uy tín. LiQi không dùng số liệu cũ hoặc dữ liệu hồ sơ để thay thế.'
      : trust.body;

  return (
    <AppCard
      backgroundColor={profileUi.colors.trustSurface}
      backgroundSlot={
        <LinearGradient
          colors={profileUi.gradients.trustSurface}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      }
      borderColor={profileUi.colors.trustBorder}
      borderOpacity={profileUi.card.trustBorderOpacity}
      contentStyle={[styles.cardContent, compact && styles.cardContentCompact]}
      density="compact"
      emphasis="low"
      frameGradient={profileUi.gradients.trustFrame}
      radius={profileUi.radii.card}
      surfaceTone="low"
      testID="profile-trust-story"
      withShadow={false}
    >
      <View pointerEvents="none" style={styles.trustAccent} />
      <ProfileCardHeader
        action={
          onOpenTrust ? (
            <ProfileSectionAction
              accessibilityLabel="Mở lịch sử uy tín"
              label="Xem tất cả"
              onPress={onOpenTrust}
            />
          ) : undefined
        }
        compact={compact}
        title="Lời khen & uy tín"
      />
      <View
        style={[styles.trustBody, compact && styles.trustBodyCompact]}
        testID="profile-trust-summary-card"
      >
        <View style={styles.sourceRow}>
          <View
            style={[
              styles.sourceIcon,
              {
                borderRadius: sourceIconSize / 2,
                height: sourceIconSize,
                width: sourceIconSize,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator
                color={appColors.accent.purpleIcon}
                size="small"
              />
            ) : (
              <Ionicons
                color={appColors.accent.purpleIcon}
                name={
                  failed ? 'cloud-offline-outline' : 'shield-checkmark-outline'
                }
                size={compact ? 17 : 19}
              />
            )}
          </View>
          <View style={styles.sourceCopy}>
            <AppText tone="accent" variant="caption">
              DỮ LIỆU UY TÍN
            </AppText>
            <AppText numberOfLines={2} tone="muted" variant="caption">
              {sourceMeta}
            </AppText>
          </View>
        </View>
        <AppText
          style={styles.trustDescription}
          testID="profile-trust-description"
          variant="body"
        >
          {body}
        </AppText>
        {!loading ? (
          <View style={styles.trustEvidenceRow}>
            <TrustEvidence
              icon="shield-checkmark-outline"
              label={trust.reliabilityLabel}
              testID="profile-trust-reliability"
            />
            <TrustEvidence
              icon="heart-outline"
              label={trust.endorsementLabel}
              testID="profile-trust-endorsements"
            />
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

function TrustEvidence({
  icon,
  label,
  testID,
}: Readonly<{
  icon: 'heart-outline' | 'shield-checkmark-outline';
  label: string;
  testID: string;
}>) {
  return (
    <View style={styles.trustEvidence} testID={testID}>
      <Ionicons color={appColors.accent.purpleIcon} name={icon} size={16} />
      <AppText tone="secondary" variant="caption">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContent: { gap: appSpacing['2xl'] },
  cardContentCompact: { gap: appSpacing.lg },
  sourceCopy: { flex: 1, gap: appSpacing.xxs, minWidth: 0 },
  sourceIcon: {
    alignItems: 'center',
    backgroundColor: profileUi.colors.iconSurface,
    flexShrink: 0,
    justifyContent: 'center',
  },
  sourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
  },
  trustAccent: {
    backgroundColor: profileUi.colors.trustAccent,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: profileUi.card.trustAccentWidth,
  },
  trustBody: { gap: appSpacing.lg },
  trustBodyCompact: { gap: appSpacing.md },
  trustDescription: { color: appColors.text.primary },
  trustEvidence: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: profileUi.colors.trustEvidenceSurface,
    borderColor: profileUi.colors.trustEvidenceBorder,
    borderRadius: profileUi.radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: appSpacing.sm,
    minHeight: 32,
    paddingHorizontal: appSpacing.md,
  },
  trustEvidenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appSpacing.sm,
  },
});
