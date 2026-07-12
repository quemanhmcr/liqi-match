import { LinearGradient } from 'expo-linear-gradient';
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

import { LiquidGlassSurface } from './LiquidGlassSurface';

export type LiquidBottomNavItem<Key extends string = string> = {
  key: Key;
  label: string;
};

export type LiquidBottomNavProps<
  Item extends LiquidBottomNavItem<string> = LiquidBottomNavItem<string>,
> = {
  activeKey: Item['key'];
  /** Use inline mode when a navigator, rather than a screen, owns placement. */
  floating?: boolean;
  items: readonly Item[];
  labelStyle?: StyleProp<TextStyle>;
  onLongPress?: (key: Item['key'], event: GestureResponderEvent) => void;
  onPress?: (key: Item['key'], event: GestureResponderEvent) => void;
  renderIcon: (item: Item, active: boolean) => ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function LiquidBottomNav<
  Item extends LiquidBottomNavItem<string> = LiquidBottomNavItem<string>,
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
}: LiquidBottomNavProps<Item>) {
  return (
    <LiquidGlassSurface
      backgroundSlot={
        <LinearGradient
          colors={['rgba(255,255,255,0.050)', 'rgba(255,255,255,0.010)']}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      }
      baseStrokeOpacity={0.042}
      baseStrokeWidth={0.54}
      blurIntensity={22}
      contentStyle={styles.surface}
      radius={24}
      style={[styles.shell, !floating && styles.inlineShell, style]}
      testID={testID}
      variant="nav"
      withInnerReflection={false}
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
    </LiquidGlassSurface>
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
    borderRadius: 17,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 0,
    paddingVertical: 1.5,
  },
  itemActive: {
    backgroundColor: 'rgba(86,105,255,0.055)',
    borderColor: 'rgba(103,232,255,0.090)',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#67E8FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
  },
  label: {
    color: 'rgba(210,218,238,0.80)',
    fontSize: 9,
    fontWeight: '600',
  },
  labelActive: { color: 'rgba(255,255,255,0.90)', fontWeight: '700' },
  pressed: { opacity: 0.82 },
  shell: {
    alignSelf: 'center',
    bottom: 14,
    left: 34,
    position: 'absolute',
    right: 34,
  },
  surface: {
    alignItems: 'center',
    borderColor: 'rgba(190,218,255,0.062)',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 3,
    padding: 4,
    width: '100%',
  },
});
