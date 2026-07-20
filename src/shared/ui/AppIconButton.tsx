import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { appMotion, appOpacity } from './theme/app-theme';

import {
  AppSurface,
  type AppSurfaceEmphasis,
  type AppSurfaceTone,
} from './AppSurface';

export type AppIconButtonProps = Readonly<{
  accessibilityLabel: string;
  backgroundColor?: string;
  backgroundSlot?: ReactNode;
  badge?: ReactNode;
  badgeStyle?: StyleProp<ViewStyle>;
  borderColor?: string;
  children: ReactNode;
  disabled?: boolean;
  emphasis?: AppSurfaceEmphasis;
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: AppSurfaceTone;
  testID?: string;
  withHighlight?: boolean;
}>;

export function AppIconButton({
  accessibilityLabel,
  backgroundColor,
  backgroundSlot,
  badge,
  badgeStyle,
  borderColor,
  children,
  disabled = false,
  emphasis = 'medium',
  onPress,
  size = 52,
  style,
  surfaceTone = 'medium',
  testID,
  withHighlight = true,
}: AppIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={null}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        { borderRadius: size / 2, height: size, width: size },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      testID={testID}
    >
      <AppSurface
        backgroundColor={backgroundColor}
        backgroundSlot={backgroundSlot}
        borderColor={borderColor}
        contentStyle={styles.content}
        emphasis={emphasis}
        height={size}
        radius={size / 2}
        surfaceTone={surfaceTone}
        variant="button"
        width={size}
        withHighlight={withHighlight}
        withShadow={false}
      >
        <View style={styles.icon}>{children}</View>
      </AppSurface>
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
  disabled: { opacity: appOpacity.disabled },
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
  pressed: {
    opacity: appOpacity.pressed,
    transform: [{ scale: appMotion.subtlePressScale }],
  },
});
