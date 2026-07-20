import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import {
  liqiColors,
  liqiComponentGradients,
  liqiComponents,
} from '@/shared/theme/liqi-design-system';

type LiqiBadgeVariant = keyof typeof liqiComponentGradients.badge;
type LiqiBadgeSize = keyof typeof liqiComponents.badge.sizes;

export type LiqiBadgeProps = Readonly<{
  children?: ReactNode;
  size?: LiqiBadgeSize;
  style?: StyleProp<ViewStyle>;
  variant?: LiqiBadgeVariant;
}>;

export function LiqiBadge({
  children,
  size = 'md',
  style,
  variant = 'pink',
}: LiqiBadgeProps) {
  const metrics = liqiComponents.badge.sizes[size];

  return (
    <LinearGradient
      colors={liqiComponentGradients.badge[variant]}
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
        colors={liqiComponents.badge.sheen}
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
    position: 'absolute',
    right: 0,
    top: 0,
    opacity: 0.42,
  },
  shell: {
    alignItems: 'center',
    borderColor: liqiComponents.badge.borderColor,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    color: liqiColors.text.primary,
    fontWeight: '700',
  },
});
