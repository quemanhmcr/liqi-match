import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, appSpacing } from '@/shared/ui';

export function ProfileCardHeader({
  action,
  compact,
  title,
  titleAccessory,
}: Readonly<{
  action?: ReactNode;
  compact: boolean;
  title: string;
  titleAccessory?: ReactNode;
}>) {
  return (
    <View style={styles.shell}>
      <View style={styles.titleRow}>
        <AppText compact={compact} numberOfLines={1} variant="h2">
          {title}
        </AppText>
        {titleAccessory}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.lg,
    justifyContent: 'space-between',
  },
  titleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: appSpacing.md,
    minWidth: 0,
  },
});
