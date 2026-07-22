import { StyleSheet, View } from 'react-native';

import { AppText, appSpacing } from '@/shared/ui';

import type { ProfileSocialStatItem } from '../model/profile-surface-presenter';
import { profileUi } from '../ui/profile-ui';

export function ProfileSocialStats({
  compact,
  items,
}: Readonly<{
  compact: boolean;
  items: readonly ProfileSocialStatItem[];
}>) {
  return (
    <View style={styles.host} testID="profile-social-stats">
      <View
        style={[styles.row, compact ? styles.rowCompact : styles.rowRegular]}
        testID="profile-social-stats-row"
      >
        {items.map((item, index) => (
          <View
            accessibilityLabel={`${item.label}: ${item.value}`}
            accessible
            key={item.label}
            style={styles.itemShell}
            testID={`profile-social-stat-${index}`}
          >
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.itemContent}>
              <AppText
                compact={compact}
                numberOfLines={1}
                style={styles.value}
                testID={`profile-social-stat-value-${index}`}
                tone={item.value === '—' ? 'muted' : 'primary'}
                variant="h2"
              >
                {item.value}
              </AppText>
              <AppText numberOfLines={1} tone="tertiary" variant="caption">
                {item.label}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: profileUi.colors.divider,
    bottom: appSpacing['2xl'],
    left: 0,
    position: 'absolute',
    top: appSpacing['2xl'],
    width: StyleSheet.hairlineWidth,
  },
  host: {
    backgroundColor: profileUi.colors.heroIdentity,
    borderBottomColor: profileUi.colors.socialStatsBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  itemContent: {
    alignItems: 'center',
    flex: 1,
    gap: appSpacing.xxs,
    justifyContent: 'center',
    minWidth: 0,
  },
  itemShell: { flex: 1, minWidth: 0, position: 'relative' },
  row: { flexDirection: 'row' },
  rowCompact: {
    minHeight: profileUi.socialStats.minHeightCompact,
    paddingHorizontal: profileUi.hero.identityPaddingHorizontalCompact,
  },
  rowRegular: {
    minHeight: profileUi.socialStats.minHeight,
    paddingHorizontal: profileUi.hero.identityPaddingHorizontal,
  },
  value: { fontVariant: ['tabular-nums'] },
});
