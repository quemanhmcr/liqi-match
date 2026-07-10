import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { LiquidBottomNav } from '@/shared/components/liquid';

import { MAIN_TABS, mainTabForRoute, type MainTabKey } from './main-tabs';

export type MainTabBarProps = {
  activeRouteName?: string;
  bottomInset?: number;
  horizontalInset?: number;
  onLongSelect?: (key: MainTabKey) => void;
  onSelect: (key: MainTabKey) => void;
};

/** Presentation adapter for the persistent tab navigator. */
export function MainTabBar({
  activeRouteName,
  bottomInset = 0,
  horizontalInset = 0,
  onLongSelect,
  onSelect,
}: MainTabBarProps) {
  const activeTab = mainTabForRoute(activeRouteName);

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(bottomInset, 12),
          paddingHorizontal: Math.max(horizontalInset + 12, 34),
        },
      ]}
      testID="main-tab-bar"
    >
      <LiquidBottomNav
        activeKey={activeTab.key}
        floating={false}
        items={MAIN_TABS}
        onLongPress={(key) => onLongSelect?.(key)}
        onPress={(key) => onSelect(key)}
        renderIcon={(tab, active) => (
          <Ionicons
            color={active ? 'rgba(255,255,255,0.84)' : '#A8AFC6'}
            name={tab.icon}
            size={active ? 22 : 21}
            style={styles.icon}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
    paddingHorizontal: 34,
    paddingTop: 6,
  },
  icon: { marginBottom: -1 },
});
