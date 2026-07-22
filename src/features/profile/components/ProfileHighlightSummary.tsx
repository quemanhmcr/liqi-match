import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, appColors, appSpacing } from '@/shared/ui';

import type { ProfileHighlightItem } from '../model/profile-surface-presenter';
import { profileUi } from '../ui/profile-ui';
import { ProfileCardHeader } from './ProfileCardHeader';

export function ProfileHighlightSummary({
  compact,
  items,
}: Readonly<{
  compact: boolean;
  items: readonly ProfileHighlightItem[];
}>) {
  const iconSize = compact
    ? profileUi.affinity.iconSizeCompact
    : profileUi.affinity.iconSize;

  return (
    <AppCard
      borderOpacity={profileUi.card.borderOpacity}
      contentStyle={[styles.cardContent, compact && styles.cardContentCompact]}
      density="compact"
      emphasis="none"
      radius={profileUi.radii.card}
      surfaceTone="low"
      testID="profile-highlight-summary"
      withShadow={false}
    >
      <ProfileCardHeader
        compact={compact}
        title="Điểm nổi bật"
        titleAccessory={
          <Ionicons
            color={appColors.accent.purpleIcon}
            name="sparkles"
            size={compact ? 15 : 17}
          />
        }
      />
      <View style={styles.itemsRow}>
        {items.map((item, index) => (
          <View
            key={item.label}
            style={styles.itemShell}
            testID={`profile-highlight-item-${index}`}
          >
            {index > 0 ? <View style={styles.divider} /> : null}
            <View
              style={[
                styles.item,
                {
                  minHeight: compact
                    ? profileUi.affinity.minHeightCompact
                    : profileUi.affinity.minHeight,
                },
              ]}
              testID={`profile-highlight-item-content-${index}`}
            >
              <View
                style={[
                  styles.iconSurface,
                  {
                    borderRadius: iconSize / 2,
                    height: iconSize,
                    width: iconSize,
                  },
                ]}
                testID={`profile-highlight-icon-${index}`}
              >
                <Ionicons
                  color={appColors.accent.purpleIcon}
                  name={item.icon}
                  size={compact ? 16 : 18}
                />
              </View>
              <AppText numberOfLines={1} tone="muted" variant="caption">
                {item.label}
              </AppText>
              <AppText
                compact={compact}
                numberOfLines={2}
                style={styles.value}
                variant="bodySmall"
              >
                {item.value}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  cardContent: { gap: appSpacing.lg },
  cardContentCompact: { gap: appSpacing.sm },
  divider: {
    backgroundColor: profileUi.colors.divider,
    bottom: appSpacing.sm,
    left: 0,
    position: 'absolute',
    top: appSpacing.sm,
    width: StyleSheet.hairlineWidth,
  },
  iconSurface: {
    alignItems: 'center',
    backgroundColor: profileUi.colors.iconSurface,
    justifyContent: 'center',
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: appSpacing.xxs,
    justifyContent: 'center',
    paddingHorizontal: appSpacing.sm,
  },
  itemShell: { flex: 1, minWidth: 0, position: 'relative' },
  itemsRow: { flexDirection: 'row' },
  value: { textAlign: 'center' },
});
