import { LinearGradient } from 'expo-linear-gradient';
import { Children, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityState,
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
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

type LiqiChipVariant = 'default' | 'selected' | 'purple' | 'cyan' | 'orange';
type LiqiChipDensity = 'mode' | 'compact' | 'tag';
type GradientColors = readonly [string, string, ...string[]];

type ChipTone = { background: string; border: string; text: string };

const chipTone: Record<LiqiChipVariant, ChipTone> = liqiComponents.chip.tones;

const tagChipTone: Record<LiqiChipVariant, ChipTone> =
  liqiComponents.chip.tagTones;

export type LiqiChipProps = {
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  density?: LiqiChipDensity;
  disabled?: boolean;
  icon?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  selected?: boolean;
  selectedGradient?: GradientColors;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  trailingIcon?: ReactNode;
  variant?: LiqiChipVariant;
  withSheen?: boolean;
};

export function LiqiChip({
  accessibilityLabel,
  accessibilityState,
  children,
  contentStyle,
  density = 'mode',
  disabled,
  icon,
  onPress,
  selected,
  selectedGradient,
  style,
  textStyle,
  trailingIcon,
  variant = 'default',
  withSheen,
}: LiqiChipProps) {
  const toneSource = density === 'tag' ? tagChipTone : chipTone;
  const tone = toneSource[selected ? 'selected' : variant];
  const shouldRenderSheen = withSheen ?? density !== 'tag';
  const content = (
    <>
      {selected && selectedGradient ? (
        <LinearGradient
          colors={selectedGradient}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.background}
        />
      ) : null}
      {shouldRenderSheen ? (
        <LinearGradient
          colors={liqiComponents.chip.sheen}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.sheen}
        />
      ) : null}
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
      {isTextOnlyChildren(children) ? (
        <Text
          style={[
            styles.text,
            density === 'tag' && styles.tagText,
            { color: tone.text },
            textStyle,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
      {trailingIcon ? (
        <View style={styles.trailingSlot}>{trailingIcon}</View>
      ) : null}
    </>
  );

  const shellStyle = [
    styles.shell,
    density === 'compact' && styles.compactShell,
    density === 'tag' && styles.tagShell,
    {
      backgroundColor: tone.background,
      borderColor: tone.border,
      opacity: disabled ? liqiOpacity.disabled : 1,
    },
    contentStyle,
  ];

  if (!onPress) {
    return <View style={[shellStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      android_ripple={null}
      disabled={disabled}
      hitSlop={liqiComponents.chip.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [shellStyle, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

function isTextOnlyChildren(children: ReactNode) {
  const childArray = Children.toArray(children).filter(
    (child) => child !== '' && child !== ' ',
  );
  return (
    childArray.length > 0 &&
    childArray.every(
      (child) => typeof child === 'string' || typeof child === 'number',
    )
  );
}

const styles = StyleSheet.create({
  background: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  compactShell: {
    minHeight: liqiComponents.chip.compactHeight,
    paddingHorizontal: liqiComponents.chip.paddingHorizontal - 2,
  },
  iconSlot: { zIndex: 2 },
  pressed: {
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
  sheen: {
    borderRadius: liqiComponents.surface.radius.chip,
    bottom: 0,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  shell: {
    alignItems: 'center',
    borderRadius: liqiComponents.surface.radius.chip,
    borderWidth: 1,
    flexDirection: 'row',
    gap: liqiComponents.chip.gap,
    justifyContent: 'center',
    minHeight: liqiComponents.chip.height,
    overflow: 'hidden',
    paddingHorizontal: liqiComponents.chip.paddingHorizontal,
  },
  tagShell: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: liqiComponents.chip.tagGap,
    minHeight: liqiComponents.chip.tagHeight,
    paddingHorizontal: liqiComponents.chip.tagPaddingHorizontal,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: -0.02,
  },
  text: {
    ...liqiTypography.chip,
    color: liqiColors.text.secondary,
    zIndex: 2,
  },
  trailingSlot: { zIndex: 2 },
});
