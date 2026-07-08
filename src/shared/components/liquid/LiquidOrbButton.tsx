import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  liquidColors,
  type LiquidGlassIntensity,
  type LiquidGlowIntensity,
} from '@/shared/theme/liquid-glass.tokens';
import { ctaPurpleCyanGlowSegments, type LiquidGlowPreset } from '@/shared/theme/liquid-glow.presets';

import { LiquidGlassSurface } from './LiquidGlassSurface';

export type LiquidOrbButtonProps = {
  accessibilityLabel: string;
  badge?: ReactNode;
  badgeStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  glassIntensity?: LiquidGlassIntensity;
  glowIntensity?: LiquidGlowIntensity;
  glowPreset?: LiquidGlowPreset;
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function LiquidOrbButton({
  accessibilityLabel,
  badge,
  badgeStyle,
  children,
  glassIntensity = 'medium',
  glowIntensity = 'medium',
  glowPreset = ctaPurpleCyanGlowSegments,
  onPress,
  size = 52,
  style,
}: LiquidOrbButtonProps) {
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
      <LiquidGlassSurface
        baseStrokeColor={liquidColors.stroke.base}
        baseStrokeOpacity={0.10}
        baseStrokeWidth={0.56}
        blurIntensity={28}
        contentStyle={styles.content}
        glassIntensity={glassIntensity}
        glowIntensity={glowIntensity}
        glowPad={12}
        glowPreset={glowPreset}
        height={size}
        radius={size / 2}
        variant="button"
        width={size}
        withInnerReflection
        withShadow={false}
      >
        <View style={styles.icon}>{children}</View>
      </LiquidGlassSurface>
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
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
