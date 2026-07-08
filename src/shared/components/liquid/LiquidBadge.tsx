import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

type LiquidBadgeVariant = 'pink' | 'cyan' | 'orange' | 'neutral';
type LiquidBadgeSize = 'sm' | 'md';
type GradientColors = readonly [string, string, ...string[]];

const badgeGradient: Record<LiquidBadgeVariant, GradientColors> = {
  pink: ['rgba(196,66,130,0.64)', 'rgba(112,68,176,0.36)'],
  cyan: ['rgba(72,210,255,0.42)', 'rgba(96,92,255,0.26)'],
  orange: ['rgba(225,118,52,0.48)', 'rgba(124,70,42,0.28)'],
  neutral: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.045)'],
};

const sizeStyle: Record<
  LiquidBadgeSize,
  { fontSize: number; height: number; minWidth: number; paddingHorizontal: number }
> = {
  sm: { fontSize: 10, height: 18, minWidth: 18, paddingHorizontal: 6 },
  md: { fontSize: 12, height: 26, minWidth: 26, paddingHorizontal: 8 },
};

export type LiquidBadgeProps = {
  children?: ReactNode;
  size?: LiquidBadgeSize;
  style?: StyleProp<ViewStyle>;
  variant?: LiquidBadgeVariant;
};

export function LiquidBadge({
  children,
  size = 'md',
  style,
  variant = 'pink',
}: LiquidBadgeProps) {
  const metrics = sizeStyle[size];

  return (
    <LinearGradient
      colors={badgeGradient[variant]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.shell,
        {
          height: metrics.height,
          minWidth: metrics.minWidth,
          paddingHorizontal: metrics.paddingHorizontal,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
        pointerEvents="none"
        style={styles.sheen}
      />
      {children !== undefined ? (
        <Text style={[styles.text, { fontSize: metrics.fontSize }]}>
          {children}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  sheen: {
    bottom: 0,
    left: 0,
    opacity: 0.42,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  shell: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    color: liquidColors.text.primary,
    fontWeight: '700',
  },
});
