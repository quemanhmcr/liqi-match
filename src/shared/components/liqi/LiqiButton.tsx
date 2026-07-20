import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  liqiColors,
  liqiComponents,
  liqiMotion,
  liqiOpacity,
  liqiShadow,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import type { LiqiEmphasis } from './LiqiSurface';

type LiqiButtonVariant = 'primary' | 'secondary' | 'rank' | 'team' | 'ghost';
type LiqiButtonState = 'idle' | 'active' | 'disabled';
type GradientColors = readonly [string, string, ...string[]];

const variantGradients: Record<LiqiButtonVariant, GradientColors> =
  liqiComponents.button.variants;

export type LiqiButtonProps = Readonly<{
  accessibilityLabel?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  emphasis?: LiqiEmphasis;
  gradientColors?: GradientColors;
  gradientLocations?: readonly [number, number, ...number[]];
  onPress?: (event: GestureResponderEvent) => void;
  radius?: number;
  state?: LiqiButtonState;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: LiqiButtonVariant;
  withShadow?: boolean;
}>;

export function LiqiButton({
  accessibilityLabel,
  children,
  contentStyle,
  disabled,
  emphasis = 'medium',
  gradientColors,
  gradientLocations,
  onPress,
  radius = liqiComponents.button.defaultRadius,
  state = 'idle',
  style,
  textStyle,
  variant = 'primary',
  withShadow = true,
}: LiqiButtonProps) {
  const isDisabled = disabled || state === 'disabled';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={null}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.host,
        withShadow && liqiShadow.cta,
        emphasisStyle(emphasis),
        {
          borderRadius: radius,
          opacity: isDisabled ? liqiOpacity.disabled : 1,
        },
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.depthShadow, { borderRadius: radius }]}
      />
      <LinearGradient
        colors={gradientColors ?? variantGradients[variant]}
        end={{ x: 1, y: 0.5 }}
        locations={gradientLocations}
        start={{ x: 0, y: 0.5 }}
        style={[styles.content, { borderRadius: radius }, contentStyle]}
      >
        <LinearGradient
          colors={liqiComponents.button.sheen}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={[styles.sheen, { borderRadius: radius }]}
        />
        <View pointerEvents="none" style={styles.edgeLine} />
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text style={[styles.text, textStyle]}>{children}</Text>
        ) : (
          children
        )}
      </LinearGradient>
    </Pressable>
  );
}

function emphasisStyle(emphasis: LiqiEmphasis): ViewStyle | undefined {
  if (emphasis === 'none') return undefined;
  if (emphasis === 'low') return { shadowOpacity: 0.1, shadowRadius: 8 };
  if (emphasis === 'high') return liqiShadow.purpleGlow;
  return {
    shadowColor: liqiColors.accent.purple,
    shadowOpacity: 0.18,
    shadowRadius: 12,
  };
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    borderColor: liqiComponents.button.contentBorder,
    borderWidth: 1,
    flexDirection: 'row',
    gap: liqiComponents.button.gap,
    justifyContent: 'center',
    minHeight: liqiComponents.button.minimumHeight,
    overflow: 'hidden',
    paddingHorizontal: liqiComponents.button.paddingHorizontal,
    paddingVertical: liqiComponents.button.paddingVertical,
    zIndex: 2,
  },
  depthShadow: {
    backgroundColor: liqiComponents.button.depthShadow,
    bottom: -8,
    left: 8,
    position: 'absolute',
    right: 8,
    top: 9,
    zIndex: 0,
  },
  edgeLine: {
    backgroundColor: liqiComponents.button.edgeLine,
    borderRadius: liqiComponents.surface.radius.button,
    height: 1,
    left: 18,
    opacity: 0.42,
    position: 'absolute',
    right: 18,
    top: 1,
  },
  host: {
    minWidth: 104,
    overflow: 'visible',
    position: 'relative',
  },
  pressed: {
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
  sheen: {
    bottom: 0,
    left: -18,
    opacity: 0.18,
    position: 'absolute',
    right: -18,
    top: -10,
  },
  text: {
    ...liqiTypography.cta,
    color: liqiColors.text.onAccent,
    letterSpacing: -0.08,
    zIndex: 2,
  },
});
