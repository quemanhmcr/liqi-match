import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  liqiColors,
  liqiComponentColors,
  liqiComponents,
  liqiMotion,
  liqiOpacity,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { LiqiSurface } from './LiqiSurface';

export type LiqiBottomNavItem<Key extends string = string> = Readonly<{
  key: Key;
  label: string;
}>;

export type LiqiBottomNavProps<
  Item extends LiqiBottomNavItem<string> = LiqiBottomNavItem<string>,
> = Readonly<{
  activeKey: Item['key'];
  floating?: boolean;
  items: readonly Item[];
  labelStyle?: StyleProp<TextStyle>;
  onLongPress?: (key: Item['key'], event: GestureResponderEvent) => void;
  onPress?: (key: Item['key'], event: GestureResponderEvent) => void;
  renderIcon: (item: Item, active: boolean) => ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function LiqiBottomNav<
  Item extends LiqiBottomNavItem<string> = LiqiBottomNavItem<string>,
>({
  activeKey,
  floating = true,
  items,
  labelStyle,
  onLongPress,
  onPress,
  renderIcon,
  style,
  testID,
}: LiqiBottomNavProps<Item>) {
  return (
    <LiqiSurface
      backgroundColor={liqiComponentColors.navigation.surface}
      contentStyle={styles.surface}
      emphasis="none"
      radius={liqiComponents.navigation.radiusCompact}
      style={[styles.shell, !floating && styles.inlineShell, style]}
      testID={testID}
      variant="nav"
      withShadow={false}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            android_ripple={null}
            collapsable={false}
            key={item.key}
            onLongPress={(event) => onLongPress?.(item.key, event)}
            onPress={(event) => onPress?.(item.key, event)}
            style={({ pressed }) => [
              styles.item,
              active && styles.itemActive,
              pressed && styles.pressed,
            ]}
            testID={testID ? `${testID}-item-${item.key}` : undefined}
          >
            {renderIcon(item, active)}
            <Text
              maxFontSizeMultiplier={1}
              style={[styles.label, active && styles.labelActive, labelStyle]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </LiqiSurface>
  );
}

const styles = StyleSheet.create({
  inlineShell: {
    alignSelf: 'stretch',
    bottom: 0,
    left: 0,
    position: 'relative',
    right: 0,
  },
  item: {
    alignItems: 'center',
    borderRadius: liqiComponents.navigation.radiusCompact - liqiSpacing.sm,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    gap: liqiSpacing.xxs,
    justifyContent: 'center',
    minHeight: liqiComponents.chip.compactHeight,
    minWidth: 0,
    paddingVertical: liqiSpacing.xxs,
  },
  itemActive: {
    backgroundColor: liqiComponentColors.navigation.activeBackground,
    borderColor: liqiColors.border.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...liqiTypography.caption,
    color: liqiComponentColors.navigation.label,
    fontSize: 9,
    lineHeight: 12,
  },
  labelActive: {
    color: liqiComponentColors.navigation.labelActive,
    fontWeight: '700',
  },
  pressed: {
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
  shell: {
    alignSelf: 'center',
    bottom: liqiSpacing['2xl'],
    left: liqiSpacing['8xl'] + liqiSpacing.xxs,
    position: 'absolute',
    right: liqiSpacing['8xl'] + liqiSpacing.xxs,
  },
  surface: {
    alignItems: 'center',
    borderColor: liqiColors.border.nav,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: liqiSpacing.xs,
    padding: liqiSpacing.xs,
    width: '100%',
  },
});
