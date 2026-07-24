import { ScrollView, StyleSheet } from 'react-native';

import { AppChip, appSpacing } from '@/shared/ui';

import {
  notificationFilters,
  type NotificationFilterId,
} from '../model/notification-filters';

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
            key={filter.id}
            onPress={() => onSelect(filter.id)}
            selected={selected}
          >
            {filter.label}
          </AppChip>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appSpacing.md,
    paddingHorizontal: appSpacing.xs,
    paddingVertical: appSpacing.xs,
  },
  rail: {
    marginHorizontal: -appSpacing.xs,
    marginTop: appSpacing['2xl'],
  },
});
