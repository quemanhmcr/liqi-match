import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type {
  LiquidGlassIntensity,
  LiquidGlowIntensity,
} from '@/shared/theme/liquid-glass.tokens';
import {
  matchedPurpleGlowSegments,
  rankCyanGlowSegments,
  teamOrangeGlowSegments,
  type LiquidGlowPreset,
} from '@/shared/theme/liquid-glow.presets';

import { LiquidGlassSurface } from './LiquidGlassSurface';

type LiquidCardVariant = 'default' | 'purple' | 'cyan' | 'orange';
type LiquidCardDensity = 'list' | 'compact' | 'regular' | 'large';

type GradientColors = readonly [string, string, ...string[]];

const cardGlowPreset: Record<LiquidCardVariant, LiquidGlowPreset> = {
  default: matchedPurpleGlowSegments,
  purple: matchedPurpleGlowSegments,
  cyan: rankCyanGlowSegments,
  orange: teamOrangeGlowSegments,
};

const densityPadding: Record<LiquidCardDensity, number> = {
  list: 10,
  compact: 10,
  regular: 14,
  large: 18,
};

export type LiquidCardProps = {
  backgroundSlot?: ReactNode;
  baseStrokeColor?: string;
  baseStrokeOpacity?: number;
  baseStrokeWidth?: number;
  blurIntensity?: number;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  density?: LiquidCardDensity;
  frameColors?: GradientColors;
  glassIntensity?: LiquidGlassIntensity;
  glowIntensity?: LiquidGlowIntensity;
  glowPreset?: LiquidGlowPreset;
  radius?: number;
  reducedGlass?: boolean;
  style?: StyleProp<ViewStyle>;
  surfaceBackground?: string;
  variant?: LiquidCardVariant;
  withInnerReflection?: boolean;
  withShadow?: boolean;
};

export function LiquidCard({
  backgroundSlot,
  baseStrokeColor,
  baseStrokeOpacity,
  baseStrokeWidth,
  blurIntensity,
  children,
  contentStyle,
  density = 'regular',
  frameColors,
  glassIntensity,
  glowIntensity,
  glowPreset,
  radius = 28,
  reducedGlass,
  style,
  surfaceBackground,
  variant = 'default',
  withInnerReflection = true,
  withShadow = true,
}: LiquidCardProps) {
  const resolvedGlowIntensity =
    glowIntensity ?? (density === 'list' ? 'low' : 'medium');
  const resolvedGlassIntensity =
    glassIntensity ?? (density === 'list' ? 'low' : 'medium');

  return (
    <LiquidGlassSurface
      backgroundSlot={backgroundSlot}
      baseStrokeColor={baseStrokeColor}
      baseStrokeOpacity={baseStrokeOpacity}
      baseStrokeWidth={baseStrokeWidth}
      blurIntensity={blurIntensity}
      contentStyle={[{ padding: densityPadding[density] }, contentStyle]}
      frameColors={frameColors}
      glassIntensity={resolvedGlassIntensity}
      glowIntensity={resolvedGlowIntensity}
      glowPreset={glowPreset ?? cardGlowPreset[variant]}
      radius={radius}
      reducedGlass={reducedGlass}
      style={style}
      surfaceBackground={surfaceBackground}
      variant="card"
      withInnerReflection={withInnerReflection}
      withShadow={withShadow}
    >
      {children}
    </LiquidGlassSurface>
  );
}
