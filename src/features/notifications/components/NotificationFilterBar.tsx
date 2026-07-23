import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppChip, appColors, appSpacing } from '@/shared/ui';

import {
  notificationFilters,
  type NotificationFilterId,
} from '../model/notification-filters';
import { notificationsUi } from '../ui/notifications-ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const filterIcons: Record<NotificationFilterId, IconName> = {
  activity: 'heart-outline',
  all: 'albums-outline',
  message: 'chatbubble-ellipses-outline',
  system: 'notifications-outline',
  unread: 'ellipse-outline',
};

export function NotificationFilterBar({
  activeFilter,
  onSelect,
}: Readonly<{
  activeFilter: NotificationFilterId;
  onSelect: (filter: NotificationFilterId) => void;
}>) {
  return (
    <ScrollView
      accessibilityLabel="Bộ lọc thông báo"
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
    >
      {notificationFilters.map((filter) => {
        const selected = filter.id === activeFilter;
        return (
          <AppChip
            accessibilityLabel={`Lọc ${filter.label}`}
            accessibilityState={{ selected }}
            density="compact"
            icon={
              <Ionicons
                color={
                  selected ? appColors.text.onAccent : appColors.icon.inactive
                }
                name={filterIcons[filter.id]}
                size={16}
              />
            }
            key={filter.id}
            onPress={() => onSelect(filter.id)}
            selected={selected}
            selectedGradient={notificationsUi.gradients.filterSelected}
            style={styles.chip}
            variant={selected ? 'selected' : 'default'}
            withSheen={selected}
          >
            {filter.label}
          </AppChip>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: notificationsUi.metrics.filterHeight },
  content: {
    gap: notificationsUi.spacing.filterGap,
    paddingHorizontal: appSpacing.xs,
    paddingVertical: appSpacing.sm,
  },
  rail: {
    marginHorizontal: -appSpacing.xs,
    marginTop: appSpacing['3xl'],
  },
});
