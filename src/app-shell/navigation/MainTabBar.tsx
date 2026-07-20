import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';

import {
  AppSurface,
  appColors,
  appMotion,
  appOpacity,
  appSpacing,
  isCompactViewport,
} from '@/shared/ui';

import { mainTabForRoute, type MainTabKey } from './main-tabs';
import { mainTabBarUi } from './main-tab-bar-ui';

export type MainTabBarProps = {
  activeRouteName?: string;
  bottomInset?: number;
  horizontalInset?: number;
  onLongSelect?: (key: MainTabKey) => void;
  onOpenSessions: () => void;
  onSelect: (key: MainTabKey) => void;
  viewportWidth?: number;
};

type ReferenceNavItem = Readonly<{
  icon: keyof typeof Ionicons.glyphMap;
  key: MainTabKey;
  label: string;
}>;

const leftItems: readonly ReferenceNavItem[] = [
  { icon: 'home', key: 'home', label: 'Trang chủ' },
  { icon: 'chatbubble-ellipses-outline', key: 'messages', label: 'Tin nhắn' },
];

const rightItems: readonly ReferenceNavItem[] = [
  { icon: 'person-outline', key: 'profile', label: 'Cá nhân' },
];

/** Reference-driven presentation adapter for the persistent tab navigator. */
export function MainTabBar({
  activeRouteName,
  bottomInset = 0,
  horizontalInset = 0,
  onLongSelect,
  onOpenSessions,
  onSelect,
  viewportWidth,
}: MainTabBarProps) {
  const windowDimensions = useWindowDimensions();
  const compact = isCompactViewport(viewportWidth ?? windowDimensions.width);
  const activeTab = mainTabForRoute(activeRouteName);

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        {
          paddingBottom: Math.max(bottomInset, appSpacing.lg),
          paddingHorizontal: Math.max(
            horizontalInset + appSpacing.lg,
            appSpacing['4xl'],
          ),
        },
      ]}
      testID="main-tab-bar"
    >
      <AppSurface
        backgroundSlot={
          <LinearGradient
            colors={mainTabBarUi.gradients.background}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            start={{ x: 0.5, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        }
        borderOpacity={0.12}
        borderWidth={0.65}
        contentStyle={[styles.surface, compact && styles.surfaceCompact]}
        emphasis="low"
        radius={
          compact
            ? mainTabBarUi.metrics.radiusCompact
            : mainTabBarUi.metrics.radius
        }
        style={styles.shell}
        backgroundColor={mainTabBarUi.colors.surface}
        testID="main-bottom-nav"
        variant="nav"
        withHighlight={false}
        withShadow={false}
      >
        <View style={[styles.sideGroup, compact && styles.sideGroupCompact]}>
          {leftItems.map((item) => (
            <ReferenceTabItem
              active={activeTab.key === item.key}
              compact={compact}
              item={item}
              key={item.key}
              onLongSelect={onLongSelect}
              onSelect={onSelect}
            />
          ))}
        </View>

        <Pressable
          accessibilityLabel="Khám phá"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab.key === 'explore' }}
          onLongPress={() => onLongSelect?.('explore')}
          onPress={() => onSelect('explore')}
          style={({ pressed }) => [
            styles.centerButtonHost,
            compact && styles.centerButtonHostCompact,
            pressed && styles.pressed,
          ]}
          testID="main-bottom-nav-item-explore"
        >
          <LinearGradient
            colors={mainTabBarUi.gradients.centerOrb}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={[styles.centerButton, compact && styles.centerButtonCompact]}
            testID="main-bottom-nav-center-heart"
          >
            <View
              style={[
                styles.centerHighlight,
                compact && styles.centerHighlightCompact,
              ]}
            />
            <Ionicons
              color={mainTabBarUi.colors.centerIcon}
              name="heart"
              size={compact ? 30 : 35}
            />
          </LinearGradient>
        </Pressable>

        <View style={[styles.sideGroup, compact && styles.sideGroupCompact]}>
          <Pressable
            accessibilityLabel="Phòng"
            accessibilityRole="button"
            onPress={onOpenSessions}
            style={({ pressed }) => [
              styles.item,
              compact && styles.itemCompact,
              pressed && styles.pressed,
            ]}
            testID="main-bottom-nav-item-sessions"
          >
            <Ionicons
              color={mainTabBarUi.colors.inactive}
              name="people-circle-outline"
              size={compact ? 24 : 27}
            />
            <Text
              maxFontSizeMultiplier={1}
              style={[styles.label, compact && styles.labelCompact]}
            >
              Phòng
            </Text>
          </Pressable>
          {rightItems.map((item) => (
            <ReferenceTabItem
              active={activeTab.key === item.key}
              compact={compact}
              item={item}
              key={item.key}
              onLongSelect={onLongSelect}
              onSelect={onSelect}
            />
          ))}
        </View>
      </AppSurface>
    </View>
  );
}

function ReferenceTabItem({
  active,
  compact,
  item,
  onLongSelect,
  onSelect,
}: {
  active: boolean;
  compact: boolean;
  item: ReferenceNavItem;
  onLongSelect?: (key: MainTabKey) => void;
  onSelect: (key: MainTabKey) => void;
}) {
  const handleLongPress = (_event: GestureResponderEvent) =>
    onLongSelect?.(item.key);

  return (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onLongPress={handleLongPress}
      onPress={() => onSelect(item.key)}
      style={({ pressed }) => [
        styles.item,
        compact && styles.itemCompact,
        active && styles.itemActive,
        pressed && styles.pressed,
      ]}
      testID={`main-bottom-nav-item-${item.key}`}
    >
      <Ionicons
        color={
          active ? mainTabBarUi.colors.active : mainTabBarUi.colors.inactive
        }
        name={item.icon}
        size={compact ? (active ? 24 : 22) : active ? 27 : 25}
        style={active && styles.activeIconGlow}
      />
      <Text
        maxFontSizeMultiplier={1}
        style={[
          styles.label,
          compact && styles.labelCompact,
          active && styles.labelActive,
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerButtonCompact: {
    borderRadius: mainTabBarUi.metrics.centerOrbCompact / 2,
    height: mainTabBarUi.metrics.centerOrbCompact,
    width: mainTabBarUi.metrics.centerOrbCompact,
  },
  centerButtonHostCompact: {
    height: mainTabBarUi.metrics.centerOrbCompact + appSpacing.xl,
    marginTop: -appSpacing['5xl'],
    width: mainTabBarUi.metrics.centerOrbCompact + appSpacing.sm,
  },
  containerCompact: {
    paddingTop: appSpacing['2xl'],
  },
  itemCompact: {
    gap: appSpacing.xxs,
    minHeight: mainTabBarUi.metrics.itemHeightCompact,
  },
  labelCompact: {
    fontSize: 9,
  },
  sideGroupCompact: {
    height: mainTabBarUi.metrics.sideGroupHeightCompact,
  },
  surfaceCompact: {
    height: mainTabBarUi.metrics.surfaceHeightCompact,
    paddingHorizontal: appSpacing.xs,
  },
  activeIconGlow: {
    textShadowColor: mainTabBarUi.colors.activeGlow,
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 11,
  },
  centerButton: {
    alignItems: 'center',
    borderColor: mainTabBarUi.colors.centerStroke,
    borderRadius: mainTabBarUi.metrics.centerOrb / 2,
    borderWidth: StyleSheet.hairlineWidth,
    height: mainTabBarUi.metrics.centerOrb,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: appColors.accent.purple,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 21,
    width: mainTabBarUi.metrics.centerOrb,
  },
  centerButtonHost: {
    alignItems: 'center',
    height: mainTabBarUi.metrics.centerOrb + appSpacing.xl,
    justifyContent: 'flex-start',
    marginHorizontal: appSpacing.xxs / 2,
    marginTop: -(appSpacing['6xl'] + 1),
    width: mainTabBarUi.metrics.centerOrb + appSpacing.xs,
    zIndex: 5,
  },
  centerHighlightCompact: {
    borderRadius: 20,
    height: 22,
    left: 11,
    top: 7,
    width: 36,
  },
  centerHighlight: {
    backgroundColor: mainTabBarUi.colors.centerHighlight,
    borderRadius: 24,
    height: 26,
    left: 13,
    position: 'absolute',
    top: 8,
    transform: [{ rotate: '-18deg' }],
    width: 42,
  },
  container: {
    backgroundColor: appColors.background.base,
    flexShrink: 0,
    paddingBottom: appSpacing.lg,
    paddingHorizontal: appSpacing['4xl'],
    paddingTop: appSpacing['4xl'] - 1,
  },
  item: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    gap: appSpacing.xxs + 1,
    justifyContent: 'center',
    minHeight: mainTabBarUi.metrics.itemHeight,
    minWidth: 0,
    paddingHorizontal: 1,
  },
  itemActive: {
    backgroundColor: mainTabBarUi.colors.activeBackground,
  },
  label: {
    color: mainTabBarUi.colors.label,
    fontSize: 10,
    fontWeight: '600',
  },
  labelActive: {
    color: mainTabBarUi.colors.labelActive,
    fontWeight: '800',
  },
  pressed: {
    opacity: appOpacity.pressed,
    transform: [{ scale: appMotion.pressScale }],
  },
  shell: {
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  sideGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    height: mainTabBarUi.metrics.sideGroupHeight,
  },
  surface: {
    alignItems: 'center',
    borderColor: appColors.border.nav,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: mainTabBarUi.metrics.surfaceHeight,
    overflow: 'visible',
    paddingHorizontal: appSpacing.sm,
    width: '100%',
  },
});
