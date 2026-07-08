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

import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { LiquidGlassSurface } from './LiquidGlassSurface';

export type LiquidBottomNavItem<Key extends string = string> = {
  key: Key;
  label: string;
};

export type LiquidBottomNavProps<
  Item extends LiquidBottomNavItem<string> = LiquidBottomNavItem<string>,
> = {
  activeKey: Item['key'];
  items: readonly Item[];
  labelStyle?: StyleProp<TextStyle>;
  onPress?: (key: Item['key'], event: GestureResponderEvent) => void;
  renderIcon: (item: Item, active: boolean) => ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function LiquidBottomNav<
  Item extends LiquidBottomNavItem<string> = LiquidBottomNavItem<string>,
>({
  activeKey,
  items,
  labelStyle,
  onPress,
  renderIcon,
  style,
}: LiquidBottomNavProps<Item>) {
  return (
    <LiquidGlassSurface
      baseStrokeOpacity={0.042}
      baseStrokeWidth={0.54}
      blurIntensity={22}
      contentStyle={styles.surface}
      radius={27}
      style={[styles.shell, style]}
      variant="nav"
      withInnerReflection={false}
      withShadow={false}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.050)', 'rgba(255,255,255,0.010)']}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            android_ripple={null}
            key={item.key}
            onPress={(event) => onPress?.(item.key, event)}
            style={({ pressed }) => [
              styles.item,
              active && styles.itemActive,
              pressed && styles.pressed,
            ]}
          >
            {active ? (
              <LinearGradient
                colors={['rgba(106,101,255,0.115)', 'rgba(56,215,255,0.030)']}
                end={{ x: 1, y: 1 }}
                pointerEvents="none"
                start={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {renderIcon(item, active)}
            <Text style={[styles.label, active && styles.labelActive, labelStyle]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </LiquidGlassSurface>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: 'center',
    borderRadius: 23,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 50,
    overflow: 'hidden',
    paddingVertical: 6,
  },
  itemActive: {
    borderColor: 'rgba(103,232,255,0.105)',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#67E8FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.055,
    shadowRadius: 8,
  },
  label: {
    color: liquidColors.text.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  labelActive: { color: 'rgba(255,255,255,0.84)', fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
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
    gap: 5,
    padding: 6,
  },
});
