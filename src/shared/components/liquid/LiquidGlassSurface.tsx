import { BlurView, type BlurViewProps } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  liquidColors,
  liquidGlass,
  liquidGlassIntensityScale,
  liquidGlowIntensityScale,
  liquidRuntime,
  liquidShadow,
  type LiquidGlassIntensity,
  type LiquidGlowIntensity,
} from '@/shared/theme/liquid-glass.tokens';
import {
  ctaPurpleCyanGlowSegments,
  heroGlowSegments,
  matchedPurpleGlowSegments,
  navActiveGlowSegments,
  type LiquidGlowPreset,
} from '@/shared/theme/liquid-glow.presets';

import { LiquidEdgeGlow, type EdgeGlowSegment } from './LiquidEdgeGlow';
import {
  useLiquidBlurTarget,
  useLiquidReducedGlass,
} from './liquid-blur-target-context';

type LiquidSurfaceVariant = 'hero' | 'card' | 'nav' | 'modal' | 'button';
type GradientColors = readonly [string, string, ...string[]];

type VariantDefaults = {
  blurIntensity: number;
  frameColors: GradientColors;
  glowPreset: LiquidGlowPreset;
  radius: number;
  shadow: ViewStyle;
  surfaceBackground: string;
};

const variantDefaults: Record<LiquidSurfaceVariant, VariantDefaults> = {
  hero: {
    blurIntensity: 36,
    frameColors: [
      'rgba(210,151,255,0.14)',
      'rgba(255,255,255,0.020)',
      'rgba(100,230,255,0.12)',
    ],
    glowPreset: heroGlowSegments,
    radius: 28,
    shadow: liquidShadow.card,
    surfaceBackground: 'rgba(7,10,23,0.52)',
  },
  card: {
    blurIntensity: 34,
    frameColors: [
      liquidColors.stroke.base,
      'rgba(255,255,255,0.035)',
      'rgba(255,255,255,0.018)',
    ],
    glowPreset: matchedPurpleGlowSegments,
    radius: liquidGlass.radius.card,
    shadow: liquidShadow.card,
    surfaceBackground: 'rgba(9,11,24,0.58)',
  },
  nav: {
    blurIntensity: liquidGlass.blur.navIntensity,
    frameColors: ['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.010)'],
    glowPreset: navActiveGlowSegments,
    radius: 24,
    shadow: liquidShadow.nav,
    surfaceBackground: 'rgba(15,18,32,0.24)',
  },
  modal: {
    blurIntensity: 38,
    frameColors: [liquidColors.stroke.base, 'rgba(255,255,255,0.02)'],
    glowPreset: matchedPurpleGlowSegments,
    radius: 30,
    shadow: liquidShadow.card,
    surfaceBackground: liquidGlass.surface.backgroundStrong,
  },
  button: {
    blurIntensity: liquidGlass.blur.cardIntensity,
    frameColors: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.04)'],
    glowPreset: ctaPurpleCyanGlowSegments,
    radius: 999,
    shadow: liquidShadow.cta,
    surfaceBackground: liquidGlass.surface.background,
  },
};

function scaleEdgeGlowSegments(
  segments: LiquidGlowPreset,
  intensity: LiquidGlowIntensity,
): readonly EdgeGlowSegment[] {
  if (intensity === 'medium') return segments;
  if (intensity === 'none') return [];

  const scale = liquidGlowIntensityScale[intensity];
  return segments.map((segment) => ({
    ...segment,
    bloomOpacity: (segment.bloomOpacity ?? 0.24) * scale.bloomOpacityMultiplier,
    bloomWidth: (segment.bloomWidth ?? 5) * scale.widthMultiplier,
    lineOpacity: (segment.lineOpacity ?? 0.52) * scale.lineOpacityMultiplier,
    lineWidth: (segment.lineWidth ?? 0.9) * scale.widthMultiplier,
  }));
}

export type LiquidGlassSurfaceProps = {
  backgroundSlot?: ReactNode;
  baseStrokeColor?: string;
  baseStrokeOpacity?: number;
  baseStrokeWidth?: number;
  blurIntensity?: number;
  blurMethod?: BlurViewProps['blurMethod'];
  blurTarget?: BlurViewProps['blurTarget'];
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  frameColors?: GradientColors;
  glassIntensity?: LiquidGlassIntensity;
  glowIntensity?: LiquidGlowIntensity;
  glowPad?: number;
  glowPreset?: LiquidGlowPreset;
  height?: number;
  radius?: number;
  reducedGlass?: boolean;
  style?: StyleProp<ViewStyle>;
  surfaceBackground?: string;
  tint?: BlurViewProps['tint'];
  variant?: LiquidSurfaceVariant;
  width?: number;
  withGlow?: boolean;
  withSurfaceTint?: boolean;
  withInnerReflection?: boolean;
  withShadow?: boolean;
};

export function LiquidGlassSurface({
  backgroundSlot,
  baseStrokeColor = liquidColors.stroke.base,
  baseStrokeOpacity = 0.08,
  baseStrokeWidth = 0.58,
  blurIntensity,
  blurMethod,
  blurTarget,
  children,
  contentStyle,
  frameColors,
  glassIntensity = 'medium',
  glowIntensity = 'medium',
  glowPad = 14,
  glowPreset,
  height,
  radius,
  reducedGlass,
  style,
  surfaceBackground,
  tint = 'dark',
  variant = 'card',
  width,
  withGlow = true,
  withSurfaceTint = false,
  withInnerReflection = true,
  withShadow = true,
}: LiquidGlassSurfaceProps) {
  const defaults = variantDefaults[variant];
  const contextBlurTarget = useLiquidBlurTarget();
  const contextReducedGlass = useLiquidReducedGlass();
  const resolvedRadius = radius ?? defaults.radius;
  const resolvedBlurTarget = blurTarget ?? contextBlurTarget;
  const resolvedBlurMethod =
    Platform.OS === 'android' && resolvedBlurTarget
      ? (blurMethod ?? 'dimezisBlurViewSdk31Plus')
      : undefined;
  const fixedFillStyle = height || width ? styles.fixedFill : undefined;
  const resolvedReducedGlass =
    reducedGlass ??
    (contextReducedGlass ||
      liquidRuntime.reducedTransparency ||
      liquidRuntime.lowPerformanceMode);
  const resolvedGlassIntensity = resolvedReducedGlass ? 'low' : glassIntensity;
  const resolvedGlowIntensity =
    glowIntensity === 'none'
      ? 'none'
      : resolvedReducedGlass
        ? 'low'
        : glowIntensity;
  const glassScale = liquidGlassIntensityScale[resolvedGlassIntensity];
  const rawGlowSegments = glowPreset ?? defaults.glowPreset;
  const scaledGlowSegments = useMemo(
    () => scaleEdgeGlowSegments(rawGlowSegments, resolvedGlowIntensity),
    [rawGlowSegments, resolvedGlowIntensity],
  );
  const resolvedSurfaceBackground =
    surfaceBackground ??
    (resolvedGlassIntensity === 'medium'
      ? defaults.surfaceBackground
      : glassScale.surfaceBackground);
  const resolvedBlurIntensity = Math.round(
    (blurIntensity ?? defaults.blurIntensity) * glassScale.blurMultiplier,
  );

  return (
    <View
      style={[
        styles.host,
        withShadow && defaults.shadow,
        { borderRadius: resolvedRadius, height, width },
        style,
      ]}
    >
      <LinearGradient
        colors={frameColors ?? defaults.frameColors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.frame, fixedFillStyle, { borderRadius: resolvedRadius }]}
      >
        {backgroundSlot}
        {withGlow && scaledGlowSegments.length ? (
          <LiquidEdgeGlow
            baseStrokeColor={baseStrokeColor}
            baseStrokeOpacity={baseStrokeOpacity}
            baseStrokeWidth={baseStrokeWidth}
            height={height}
            pad={glowPad}
            radius={resolvedRadius}
            segments={scaledGlowSegments}
            width={width}
          />
        ) : null}
        <BlurView
          blurMethod={resolvedBlurMethod}
          blurTarget={resolvedBlurTarget}
          intensity={resolvedBlurIntensity}
          style={[
            styles.surface,
            fixedFillStyle,
            {
              backgroundColor: resolvedSurfaceBackground,
              borderRadius: Math.max(resolvedRadius - 1, 0),
            },
            contentStyle,
          ]}
          tint={tint}
        >
          {withSurfaceTint ? (
            <View pointerEvents="none" style={styles.surfaceTint} />
          ) : null}
          {withInnerReflection && !resolvedReducedGlass ? (
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.10)',
                'rgba(255,255,255,0.018)',
                'rgba(3,7,20,0.24)',
              ]}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {children}
        </BlurView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'visible',
    padding: 1,
    position: 'relative',
  },
  fixedFill: {
    height: '100%',
    width: '100%',
  },
  host: {
    overflow: 'visible',
    position: 'relative',
  },
  surface: {
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  },
  surfaceTint: {
    backgroundColor: liquidGlass.surface.tint,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
