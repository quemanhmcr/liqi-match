import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { liqiMotion, liqiOpacity } from '@/shared/theme/liqi-design-system';

import {
  LiqiSurface,
  type LiqiEmphasis,
  type LiqiSurfaceTone,
} from './LiqiSurface';

export type LiqiOrbButtonProps = Readonly<{
  accessibilityLabel: string;
  badge?: ReactNode;
  badgeStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  emphasis?: LiqiEmphasis;
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: LiqiSurfaceTone;
}>;

export function LiqiOrbButton({
  accessibilityLabel,
  badge,
  badgeStyle,
  children,
  emphasis = 'medium',
  onPress,
  size = 52,
  style,
  surfaceTone = 'medium',
}: LiqiOrbButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        { borderRadius: size / 2, height: size, width: size },
        pressed && styles.pressed,
        style,
      ]}
    >
      <LiqiSurface
        contentStyle={styles.content}
        emphasis={emphasis}
        height={size}
        radius={size / 2}
        surfaceTone={surfaceTone}
        variant="button"
        width={size}
        withHighlight
        withShadow={false}
      >
        <View style={styles.icon}>{children}</View>
      </LiqiSurface>
      {badge ? (
        <View pointerEvents="none" style={[styles.badgeHost, badgeStyle]}>
          {badge}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badgeHost: {
    elevation: 20,
    position: 'absolute',
    right: 8,
    top: 5,
    zIndex: 20,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  icon: { zIndex: 3 },
  pressable: {
    overflow: 'visible',
    position: 'relative',
  },
  pressed: {
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
});
