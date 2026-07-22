import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import {
  AppText,
  appColors,
  appMotion,
  appOpacity,
  appSpacing,
} from '@/shared/ui';

export function ProfileSectionAction({
  accessibilityLabel,
  label,
  onPress,
}: Readonly<{
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={appSpacing.lg}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <AppText numberOfLines={1} tone="secondary" variant="caption">
        {label}
      </AppText>
      <Ionicons
        color={appColors.icon.inactive}
        name="chevron-forward"
        size={15}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: appSpacing.xs,
    minHeight: 32,
    paddingLeft: appSpacing.md,
  },
  pressed: {
    opacity: appOpacity.subtlePressed,
    transform: [{ scale: appMotion.subtlePressScale }],
  },
});
