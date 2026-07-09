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
  liquidColors,
  liquidGlass,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

type LiquidChipVariant = 'default' | 'selected' | 'purple' | 'cyan' | 'orange';
type LiquidChipDensity = 'mode' | 'compact' | 'tag';

type ChipTone = { background: string; border: string; text: string };

const chipTone: Record<LiquidChipVariant, ChipTone> = {
  default: {
    background: 'rgba(255,255,255,0.065)',
    border: 'rgba(255,255,255,0.14)',
    text: '#BAC3DA',
  },
  selected: {
    background: 'rgba(96,106,255,0.17)',
    border: 'rgba(178,198,255,0.22)',
    text: 'rgba(246,249,255,0.90)',
  },
  purple: {
    background: 'rgba(162,92,255,0.12)',
    border: 'rgba(176,119,255,0.30)',
    text: '#E6D2FF',
  },
  cyan: {
    background: 'rgba(55,145,255,0.075)',
    border: 'rgba(103,232,255,0.16)',
    text: 'rgba(189,244,255,0.82)',
  },
  orange: {
    background: 'rgba(255,138,61,0.075)',
    border: 'rgba(255,155,80,0.22)',
    text: '#FFB264',
  },
};

const tagChipTone: Record<LiquidChipVariant, ChipTone> = {
  default: {
    background: 'rgba(255,255,255,0.045)',
    border: 'rgba(255,255,255,0.10)',
    text: 'rgba(220,226,245,0.74)',
  },
  selected: {
    background: 'rgba(96,106,255,0.11)',
    border: 'rgba(178,198,255,0.15)',
    text: 'rgba(238,246,255,0.82)',
  },
  purple: {
    background: 'rgba(148,92,220,0.075)',
    border: 'rgba(194,138,255,0.16)',
    text: 'rgba(231,216,255,0.76)',
  },
  cyan: {
    background: 'rgba(55,145,255,0.046)',
    border: 'rgba(103,232,255,0.11)',
    text: 'rgba(186,239,255,0.68)',
  },
  orange: {
    background: 'rgba(255,145,74,0.055)',
    border: 'rgba(255,178,104,0.15)',
    text: 'rgba(255,211,168,0.76)',
  },
};

export type LiquidChipProps = {
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  density?: LiquidChipDensity;
  disabled?: boolean;
  icon?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: LiquidChipVariant;
  withSheen?: boolean;
};

export function LiquidChip({
  accessibilityLabel,
  accessibilityState,
  children,
  contentStyle,
  density = 'mode',
  disabled,
  icon,
  onPress,
  selected,
  style,
  textStyle,
  variant = 'default',
  withSheen,
}: LiquidChipProps) {
  const toneSource = density === 'tag' ? tagChipTone : chipTone;
  const tone = toneSource[selected ? 'selected' : variant];
  const shouldRenderSheen = withSheen ?? density !== 'tag';
  const content = (
    <>
      {shouldRenderSheen ? (
        <LinearGradient
          colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.025)']}
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
    </>
  );

  const shellStyle = [
    styles.shell,
    density === 'compact' && styles.compactShell,
    density === 'tag' && styles.tagShell,
    {
      backgroundColor: tone.background,
      borderColor: tone.border,
      opacity: disabled ? 0.48 : 1,
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
  compactShell: {
    minHeight: 29,
    paddingHorizontal: 8,
  },
  iconSlot: { zIndex: 2 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  sheen: {
    borderRadius: liquidGlass.radius.chip,
    bottom: 0,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  shell: {
    alignItems: 'center',
    borderRadius: liquidGlass.radius.chip,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 31,
    overflow: 'hidden',
    paddingHorizontal: 9,
  },
  tagShell: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: -0.02,
  },
  text: {
    ...liquidTypography.chip,
    color: liquidColors.text.secondary,
    zIndex: 2,
  },
});
