import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type AccessibilityState,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppCard, type AppCardProps } from './AppCard';
import { appColors, appMotion, appOpacity } from './theme/app-theme';

export type AppPressableCardProps = Omit<
  AppCardProps,
  'borderColor' | 'children' | 'style'
> &
  Readonly<{
    /** Describes the single action performed by pressing the entire card. */
    accessibilityLabel: string;
    /** Extra native accessibility state merged with selected and disabled. */
    accessibilityState?: AccessibilityState;
    /** Visual overrides for the inner AppCard host. */
    cardStyle?: StyleProp<ViewStyle>;
    children: ReactNode;
    disabled?: boolean;
    onPress: (event: GestureResponderEvent) => void;
    /** Applies canonical selected surface, border and accessibility state. */
    selected?: boolean;
    /** Layout overrides for the outer press target. */
    style?: StyleProp<ViewStyle>;
  }>;

/**
 * A card whose complete surface is one action or one selectable option.
 *
 * Owns pressed, disabled and selected behavior while delegating visual surface
 * composition to AppCard. Do not use it when children contain independent
 * buttons, links or multiple actions; keep that composition feature-owned.
 */
export function AppPressableCard({
  accessibilityLabel,
  accessibilityState,
  cardStyle,
  children,
  disabled = false,
  onPress,
  selected = false,
  style,
  surfaceTone,
  withHighlight,
  ...cardProps
}: AppPressableCardProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled,
        selected,
      }}
      android_ripple={null}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.host,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <AppCard
        {...cardProps}
        borderColor={selected ? appColors.border.focus : undefined}
        style={[styles.card, cardStyle]}
        surfaceTone={surfaceTone ?? (selected ? 'high' : 'low')}
        withHighlight={withHighlight ?? selected}
      >
        {children}
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  disabled: { opacity: appOpacity.disabled },
  host: { overflow: 'visible' },
  pressed: {
    opacity: appOpacity.pressed,
    transform: [{ scale: appMotion.subtlePressScale }],
  },
});
