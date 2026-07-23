import { StyleSheet, View } from 'react-native';

import { AppSectionHeader } from '@/shared/ui';

import { NotificationRow } from './NotificationRow';
import type { NotificationItem } from '../model/notification-view-model';
import { notificationsUi } from '../ui/notifications-ui';

export function NotificationGroup({
  compact,
  items,
  label,
  onAction,
}: Readonly<{
  compact: boolean;
  items: readonly NotificationItem[];
  label: NotificationItem['group'];
  onAction: (item: NotificationItem) => void;
}>) {
  if (!items.length) return null;
  return (
    <View testID={`notification-group-${label}`}>
      <AppSectionHeader title={label} />
      <View style={styles.rows}>
        {items.map((item) => (
          <NotificationRow
            compact={compact}
            item={item}
            key={item.id}
            onAction={() => onAction(item)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: notificationsUi.spacing.rowGap,
    marginTop: notificationsUi.spacing.rowGap,
  },
});
