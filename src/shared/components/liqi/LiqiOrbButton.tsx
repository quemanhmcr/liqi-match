import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { liqiMotion, liqiOpacity } from '@/shared/theme/liqi-design-system';

import {
  LiqiSurface,
  type LiqiEmphasis,
  type LiqiSurfaceTone,
} from './LiqiSurface';

export type LiqiOrbButtonProps = Readonly<{
  accessibilityLabel: string;
  backgroundColor?: string;
  backgroundSlot?: ReactNode;
  badge?: ReactNode;
  badgeStyle?: StyleProp<ViewStyle>;
  borderColor?: string;
  children: ReactNode;
  disabled?: boolean;
  emphasis?: LiqiEmphasis;
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: LiqiSurfaceTone;
  testID?: string;
  withHighlight?: boolean;
}>;

export function LiqiOrbButton({
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
}: LiqiOrbButtonProps) {
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
      <LiqiSurface
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
      </LiqiSurface>
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
  disabled: { opacity: liqiOpacity.disabled },
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
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
});
