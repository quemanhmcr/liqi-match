import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  liqiColors,
  liqiComponents,
  liqiShadow,
} from '@/shared/theme/liqi-design-system';

export type LiqiEmphasis = 'none' | 'low' | 'medium' | 'high';
export type LiqiSurfaceTone = 'low' | 'medium' | 'high';
export type LiqiSurfaceVariant = 'hero' | 'card' | 'nav' | 'modal' | 'button';

type GradientColors = readonly [string, string, ...string[]];

type VariantDefaults = Readonly<{
  backgroundColor: string;
  borderColor: string;
  frameGradient: GradientColors;
  radius: number;
  shadow: ViewStyle;
}>;

const defaults: Record<LiqiSurfaceVariant, VariantDefaults> = {
  hero: {
    backgroundColor: liqiColors.background.elevatedStrong,
    borderColor: liqiColors.border.image,
    frameGradient: [liqiColors.border.surface, liqiColors.border.surfaceSoft],
    radius: liqiComponents.surface.radius.card,
    shadow: liqiShadow.card,
  },
  card: {
    backgroundColor: liqiColors.background.elevated,
    borderColor: liqiColors.border.card,
    frameGradient: [liqiColors.border.card, liqiColors.border.surfaceSoft],
    radius: liqiComponents.surface.radius.card,
    shadow: liqiShadow.card,
  },
  nav: {
    backgroundColor: liqiColors.background.elevatedStrong,
    borderColor: liqiColors.border.nav,
    frameGradient: [liqiColors.border.nav, liqiColors.border.surfaceSoft],
    radius: liqiComponents.surface.radius.nav,
    shadow: liqiShadow.nav,
  },
  modal: {
    backgroundColor: liqiColors.background.deep,
    borderColor: liqiColors.border.card,
    frameGradient: [liqiColors.border.card, liqiColors.border.surfaceSoft],
    radius: liqiComponents.surface.radius.card,
    shadow: liqiShadow.card,
  },
  button: {
    backgroundColor: liqiColors.background.elevatedStrong,
    borderColor: liqiColors.border.control,
    frameGradient: [liqiColors.border.surface, liqiColors.border.surfaceSoft],
    radius: liqiComponents.surface.radius.button,
    shadow: liqiShadow.cta,
  },
};

export type LiqiSurfaceProps = Readonly<{
  backgroundColor?: string;
  backgroundSlot?: ReactNode;
  borderColor?: string;
  borderOpacity?: number;
  borderWidth?: number;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  emphasis?: LiqiEmphasis;
  frameGradient?: GradientColors;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: LiqiSurfaceTone;
  testID?: string;
  variant?: LiqiSurfaceVariant;
  width?: number;
  withHighlight?: boolean;
  withOverlay?: boolean;
  withShadow?: boolean;
}>;

export function LiqiSurface({
  backgroundColor,
  backgroundSlot,
  borderColor,
  borderOpacity = 1,
  borderWidth = StyleSheet.hairlineWidth,
  children,
  contentStyle,
  emphasis = 'low',
  frameGradient,
  height,
  radius,
  style,
  surfaceTone = 'medium',
  testID,
  variant = 'card',
  width,
  withHighlight = false,
  withOverlay = false,
  withShadow = true,
}: LiqiSurfaceProps) {
  const recipe = defaults[variant];
  const resolvedRadius = radius ?? recipe.radius;
  const resolvedBackground =
    backgroundColor ?? surfaceBackground(recipe.backgroundColor, surfaceTone);
  const fixedFill = height !== undefined || width !== undefined;

  return (
    <View
      style={[
        styles.host,
        withShadow && recipe.shadow,
        emphasisShadow(emphasis),
        { borderRadius: resolvedRadius, height, width },
        style,
      ]}
      testID={testID}
    >
      <LinearGradient
        colors={frameGradient ?? recipe.frameGradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[
          styles.frame,
          fixedFill && styles.fixedFill,
          { borderRadius: resolvedRadius },
        ]}
      >
        <View
          style={[
            styles.surface,
            fixedFill && styles.fixedFill,
            {
              backgroundColor: resolvedBackground,
              borderRadius: Math.max(resolvedRadius - 1, 0),
            },
            contentStyle,
          ]}
          testID={testID ? `${testID}-content` : undefined}
        >
          {backgroundSlot}
          {withOverlay ? (
            <View pointerEvents="none" style={styles.overlay} />
          ) : null}
          {withHighlight ? (
            <LinearGradient
              colors={liqiComponents.surface.highlight}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {children}
          {borderWidth > 0 && borderOpacity > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.border,
                {
                  borderColor: borderColor ?? recipe.borderColor,
                  borderRadius: Math.max(resolvedRadius - 1, 0),
                  borderWidth,
                  opacity: borderOpacity,
                },
              ]}
            />
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

function surfaceBackground(base: string, tone: LiqiSurfaceTone) {
  if (tone === 'low') return liqiComponents.surface.background.low;
  if (tone === 'high') return liqiComponents.surface.background.high;
  return base;
}

function emphasisShadow(emphasis: LiqiEmphasis): ViewStyle | undefined {
  if (emphasis === 'none') return undefined;
  if (emphasis === 'low') {
    return {
      shadowColor: liqiColors.accent.purple,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    };
  }
  if (emphasis === 'medium') {
    return {
      shadowColor: liqiColors.accent.purple,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    };
  }
  return liqiShadow.purpleGlow;
}

const styles = StyleSheet.create({
  border: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  fixedFill: {
    height: '100%',
    width: '100%',
  },
  frame: {
    overflow: 'visible',
    padding: 1,
    position: 'relative',
  },
  host: {
    overflow: 'visible',
    position: 'relative',
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: liqiComponents.surface.overlay,
  },
  surface: {
    overflow: 'hidden',
    position: 'relative',
  },
});
