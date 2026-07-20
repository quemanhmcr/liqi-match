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
  appColors,
  appMotion,
  appOpacity,
  appShadows,
  appTypography,
} from './theme/app-theme';

import { sharedUiRecipes } from './internal/component-recipes';

import type { AppSurfaceEmphasis } from './AppSurface';

type AppButtonVariant = 'primary' | 'secondary' | 'rank' | 'team' | 'ghost';
type AppButtonState = 'idle' | 'active' | 'disabled';
type GradientColors = readonly [string, string, ...string[]];

const variantGradients: Record<AppButtonVariant, GradientColors> =
  sharedUiRecipes.button.variants;

export type AppButtonProps = Readonly<{
  accessibilityLabel?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  emphasis?: AppSurfaceEmphasis;
  gradientColors?: GradientColors;
  gradientLocations?: readonly [number, number, ...number[]];
  onPress?: (event: GestureResponderEvent) => void;
  radius?: number;
  state?: AppButtonState;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: AppButtonVariant;
  withShadow?: boolean;
}>;

export function AppButton({
  accessibilityLabel,
  children,
  contentStyle,
  disabled,
  emphasis = 'medium',
  gradientColors,
  gradientLocations,
  onPress,
  radius = sharedUiRecipes.button.defaultRadius,
  state = 'idle',
  style,
  textStyle,
  variant = 'primary',
  withShadow = true,
}: AppButtonProps) {
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
        withShadow && appShadows.cta,
        emphasisStyle(emphasis),
        {
          borderRadius: radius,
          opacity: isDisabled ? appOpacity.disabled : 1,
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
          colors={sharedUiRecipes.button.sheen}
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

function emphasisStyle(emphasis: AppSurfaceEmphasis): ViewStyle | undefined {
  if (emphasis === 'none') return undefined;
  if (emphasis === 'low') return { shadowOpacity: 0.1, shadowRadius: 8 };
  if (emphasis === 'high') return appShadows.purpleGlow;
  return {
    shadowColor: appColors.accent.purple,
    shadowOpacity: 0.18,
    shadowRadius: 12,
  };
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    borderColor: sharedUiRecipes.button.contentBorder,
    borderWidth: 1,
    flexDirection: 'row',
    gap: sharedUiRecipes.button.gap,
    justifyContent: 'center',
    minHeight: sharedUiRecipes.button.minimumHeight,
    overflow: 'hidden',
    paddingHorizontal: sharedUiRecipes.button.paddingHorizontal,
    paddingVertical: sharedUiRecipes.button.paddingVertical,
    zIndex: 2,
  },
  depthShadow: {
    backgroundColor: sharedUiRecipes.button.depthShadow,
    bottom: -8,
    left: 8,
    position: 'absolute',
    right: 8,
    top: 9,
    zIndex: 0,
  },
  edgeLine: {
    backgroundColor: sharedUiRecipes.button.edgeLine,
    borderRadius: sharedUiRecipes.surface.radius.button,
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
    opacity: appOpacity.pressed,
    transform: [{ scale: appMotion.subtlePressScale }],
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
    ...appTypography.cta,
    color: appColors.text.onAccent,
    letterSpacing: -0.08,
    zIndex: 2,
  },
});
