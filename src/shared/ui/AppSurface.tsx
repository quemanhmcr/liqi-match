import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { appColors, appShadows } from './theme/app-theme';
import { sharedUiRecipes } from './internal/component-recipes';

export type AppSurfaceEmphasis = 'none' | 'low' | 'medium' | 'high';
export type AppSurfaceTone = 'low' | 'medium' | 'high';
export type AppSurfaceVariant = 'hero' | 'card' | 'nav' | 'modal' | 'button';

type GradientColors = readonly [string, string, ...string[]];

type VariantDefaults = Readonly<{
  backgroundColor: string;
  borderColor: string;
  frameGradient: GradientColors;
  radius: number;
  shadow: ViewStyle;
}>;

const defaults: Record<AppSurfaceVariant, VariantDefaults> = {
  hero: {
    backgroundColor: appColors.background.elevatedStrong,
    borderColor: appColors.border.image,
    frameGradient: [appColors.border.surface, appColors.border.surfaceSoft],
    radius: sharedUiRecipes.surface.radius.card,
    shadow: appShadows.card,
  },
  card: {
    backgroundColor: appColors.background.elevated,
    borderColor: appColors.border.card,
    frameGradient: [appColors.border.card, appColors.border.surfaceSoft],
    radius: sharedUiRecipes.surface.radius.card,
    shadow: appShadows.card,
  },
  nav: {
    backgroundColor: appColors.background.elevatedStrong,
    borderColor: appColors.border.nav,
    frameGradient: [appColors.border.nav, appColors.border.surfaceSoft],
    radius: sharedUiRecipes.surface.radius.nav,
    shadow: appShadows.nav,
  },
  modal: {
    backgroundColor: appColors.background.deep,
    borderColor: appColors.border.card,
    frameGradient: [appColors.border.card, appColors.border.surfaceSoft],
    radius: sharedUiRecipes.surface.radius.card,
    shadow: appShadows.card,
  },
  button: {
    backgroundColor: appColors.background.elevatedStrong,
    borderColor: appColors.border.control,
    frameGradient: [appColors.border.surface, appColors.border.surfaceSoft],
    radius: sharedUiRecipes.surface.radius.button,
    shadow: appShadows.cta,
  },
};

export type AppSurfaceProps = Readonly<{
  backgroundColor?: string;
  backgroundSlot?: ReactNode;
  borderColor?: string;
  borderOpacity?: number;
  borderWidth?: number;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  emphasis?: AppSurfaceEmphasis;
  frameGradient?: GradientColors;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: AppSurfaceTone;
  testID?: string;
  variant?: AppSurfaceVariant;
  width?: number;
  withHighlight?: boolean;
  withOverlay?: boolean;
  withShadow?: boolean;
}>;

export function AppSurface({
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
}: AppSurfaceProps) {
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
              colors={sharedUiRecipes.surface.highlight}
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

function surfaceBackground(base: string, tone: AppSurfaceTone) {
  if (tone === 'low') return sharedUiRecipes.surface.background.low;
  if (tone === 'high') return sharedUiRecipes.surface.background.high;
  return base;
}

function emphasisShadow(emphasis: AppSurfaceEmphasis): ViewStyle | undefined {
  if (emphasis === 'none') return undefined;
  if (emphasis === 'low') {
    return {
      shadowColor: appColors.accent.purple,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    };
  }
  if (emphasis === 'medium') {
    return {
      shadowColor: appColors.accent.purple,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    };
  }
  return appShadows.purpleGlow;
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
    backgroundColor: sharedUiRecipes.surface.overlay,
  },
  surface: {
    overflow: 'hidden',
    position: 'relative',
  },
});
