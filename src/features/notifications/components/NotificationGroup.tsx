import { Fragment } from 'react';
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
        {items.map((item, index) => (
          <Fragment key={item.id}>
            <NotificationRow
              compact={compact}
              item={item}
              onAction={() => onAction(item)}
            />
            {index < items.length - 1 ? (
              <View
                pointerEvents="none"
                style={styles.separator}
                testID={`notification-separator-${item.id}`}
              />
            ) : null}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { marginTop: notificationsUi.spacing.rowVertical },
  separator: {
    backgroundColor: notificationsUi.colors.separator,
    height: StyleSheet.hairlineWidth,
    marginLeft: notificationsUi.spacing.separatorInset,
  },
});
