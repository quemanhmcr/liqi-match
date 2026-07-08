import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, type ReactNode } from 'react';
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
  liquidEdgeGlow,
  liquidGlass,
  liquidGlowIntensityScale,
  liquidShadow,
  liquidTypography,
  type LiquidGlowIntensity,
} from '@/shared/theme/liquid-glass.tokens';
import {
  ctaPurpleCyanGlowSegments,
  type LiquidGlowPreset,
} from '@/shared/theme/liquid-glow.presets';

import { LiquidEdgeGlow, type EdgeGlowSegment } from './LiquidEdgeGlow';
import { useLiquidReducedGlass } from './liquid-blur-target-context';

type LiquidButtonVariant = 'primary' | 'secondary' | 'rank' | 'team' | 'ghost';
type LiquidButtonState = 'idle' | 'active' | 'disabled';
type GradientColors = readonly [string, string, ...string[]];

const variantGradients: Record<LiquidButtonVariant, GradientColors> = {
  primary: [
    'rgba(142,86,218,0.90)',
    'rgba(78,82,200,0.90)',
    'rgba(70,142,188,0.86)',
  ],
  secondary: ['rgba(28,31,51,0.72)', 'rgba(18,20,38,0.56)'],
  rank: ['rgba(18,46,72,0.90)', 'rgba(55,142,172,0.86)'],
  team: ['rgba(96,55,32,0.90)', 'rgba(166,92,56,0.86)'],
  ghost: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.018)'],
};

function scaleButtonGlowSegments(
  segments: LiquidGlowPreset,
  intensity: LiquidGlowIntensity,
): readonly EdgeGlowSegment[] {
  if (intensity === 'medium') return segments;
  if (intensity === 'none') return [];

  const scale = liquidGlowIntensityScale[intensity];
  return segments.map((segment) => ({
    ...segment,
    bloomOpacity:
      (segment.bloomOpacity ?? 0.24) * scale.bloomOpacityMultiplier,
    bloomWidth: (segment.bloomWidth ?? 5) * scale.widthMultiplier,
    lineOpacity: (segment.lineOpacity ?? 0.52) * scale.lineOpacityMultiplier,
    lineWidth: (segment.lineWidth ?? 0.9) * scale.widthMultiplier,
  }));
}

export type LiquidButtonProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  glowIntensity?: LiquidGlowIntensity;
  glowPreset?: LiquidGlowPreset;
  gradientColors?: GradientColors;
  gradientLocations?: readonly [number, number, ...number[]];
  onPress?: (event: GestureResponderEvent) => void;
  radius?: number;
  reducedGlass?: boolean;
  state?: LiquidButtonState;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: LiquidButtonVariant;
  withShadow?: boolean;
};

export function LiquidButton({
  accessibilityLabel,
  children,
  contentStyle,
  disabled,
  glowIntensity = 'medium',
  glowPreset = ctaPurpleCyanGlowSegments,
  gradientColors,
  gradientLocations,
  onPress,
  radius = 28,
  reducedGlass,
  state = 'idle',
  style,
  textStyle,
  variant = 'primary',
  withShadow = true,
}: LiquidButtonProps) {
  const contextReducedGlass = useLiquidReducedGlass();
  const isDisabled = disabled || state === 'disabled';
  const resolvedReducedGlass = reducedGlass ?? contextReducedGlass;
  const resolvedGlowIntensity =
    glowIntensity === 'none'
      ? 'none'
      : resolvedReducedGlass
        ? 'low'
        : glowIntensity;
  const scaledGlowSegments = useMemo(
    () => scaleButtonGlowSegments(glowPreset, resolvedGlowIntensity),
    [glowPreset, resolvedGlowIntensity],
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={null}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.host,
        withShadow && liquidShadow.cta,
        { borderRadius: radius, opacity: isDisabled ? 0.48 : 1 },
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.depthShadow, { borderRadius: radius }]} />
      {scaledGlowSegments.length ? (
        <LiquidEdgeGlow
          baseStrokeOpacity={liquidEdgeGlow.cta.baseStrokeOpacity}
          baseStrokeWidth={0.58}
          pad={liquidEdgeGlow.cta.pad}
          radius={radius}
          segments={scaledGlowSegments}
        />
      ) : null}
      <LinearGradient
        colors={gradientColors ?? variantGradients[variant]}
        end={{ x: 1, y: 1 }}
        locations={gradientLocations}
        start={{ x: 0, y: 0 }}
        style={[styles.content, { borderRadius: radius }, contentStyle]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.50)',
            'rgba(255,255,255,0.08)',
            'rgba(255,255,255,0)',
          ]}
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

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.17)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 35,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 8,
    zIndex: 2,
  },
  depthShadow: {
    backgroundColor: 'rgba(0,0,0,0.14)',
    bottom: -8,
    left: 8,
    position: 'absolute',
    right: 8,
    top: 9,
    zIndex: 0,
  },
  edgeLine: {
    backgroundColor: 'rgba(255,255,255,0.46)',
    borderRadius: liquidGlass.radius.button,
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
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  sheen: {
    bottom: 0,
    left: -18,
    opacity: 0.18,
    position: 'absolute',
    right: -18,
    top: -10,
  },
  text: {
    ...liquidTypography.cta,
    color: '#FFFFFF',
    letterSpacing: -0.08,
    zIndex: 2,
  },
});
