import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  liqiColors,
  liqiComponentColors,
  liqiComponents,
  liqiMotion,
  liqiOpacity,
  liqiShadow,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { ProfileText } from './ProfileShared';

export type ProfileSurfaceProps = Readonly<{
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/**
 * Profile content surface built from the same opaque, bordered primitives used
 * by Home. It intentionally has no backdrop blur, glass reflection or glow.
 */
export function ProfileSurface({
  children,
  compact = false,
  style,
  testID,
}: ProfileSurfaceProps) {
  return (
    <View
      style={[styles.surface, compact && styles.surfaceCompact, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export type ProfilePillTone = 'amber' | 'cyan' | 'neutral' | 'pink' | 'purple';

export function ProfilePill({
  icon,
  label,
  style,
  tone = 'neutral',
}: Readonly<{
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  style?: StyleProp<ViewStyle>;
  tone?: ProfilePillTone;
}>) {
  const colors = pillTone(tone);
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.background, borderColor: colors.border },
        style,
      ]}
    >
      {icon ? <Ionicons color={colors.icon} name={icon} size={12} /> : null}
      <ProfileText
        numberOfLines={1}
        style={[styles.pillText, { color: colors.text }]}
      >
        {label}
      </ProfileText>
    </View>
  );
}

export type ProfileActionVariant = 'danger' | 'ghost' | 'primary' | 'secondary';

export function ProfileActionButton({
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = 'secondary',
}: Readonly<{
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: ProfileActionVariant;
}>) {
  const content = (
    <View style={styles.actionContent}>
      {icon ? (
        <Ionicons
          color={
            variant === 'primary'
              ? liqiColors.text.onAccent
              : actionTone(variant).text
          }
          name={icon}
          size={16}
        />
      ) : null}
      <ProfileText
        style={[
          styles.actionText,
          {
            color:
              variant === 'primary'
                ? liqiColors.text.onAccent
                : actionTone(variant).text,
          },
        ]}
      >
        {label}
      </ProfileText>
    </View>
  );

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        variant !== 'primary' && {
          backgroundColor: actionTone(variant).background,
          borderColor: actionTone(variant).border,
        },
        variant === 'primary' && styles.primaryAction,
        pressed && styles.actionPressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={liqiComponents.button.primaryGradient}
          end={{ x: 1, y: 0.5 }}
          start={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {content}
    </Pressable>
  );
}

function pillTone(tone: ProfilePillTone) {
  switch (tone) {
    case 'amber':
      return liqiComponentColors.profile.pills.amber;
    case 'cyan':
      return liqiComponentColors.profile.pills.cyan;
    case 'pink':
      return liqiComponentColors.profile.pills.pink;
    case 'purple':
      return liqiComponentColors.profile.pills.purple;
    case 'neutral':
      return liqiComponentColors.profile.pills.neutral;
  }
}

function actionTone(variant: Exclude<ProfileActionVariant, 'primary'>) {
  switch (variant) {
    case 'danger':
      return liqiComponentColors.profile.actions.danger;
    case 'ghost':
      return liqiComponentColors.profile.actions.ghost;
    case 'secondary':
      return liqiComponentColors.profile.actions.secondary;
  }
}

const styles = StyleSheet.create({
  action: {
    borderRadius: liqiComponents.profile.actionRadius,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: liqiComponents.button.minimumHeight,
    overflow: 'hidden',
  },
  actionContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: liqiSpacing.md,
    justifyContent: 'center',
    minHeight: liqiComponents.button.minimumHeight,
    paddingHorizontal: liqiSpacing.xl,
  },
  actionPressed: {
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.pressScale }],
  },
  actionText: { ...liqiTypography.buttonCompact },
  disabled: { opacity: liqiOpacity.disabled },
  pill: {
    alignItems: 'center',
    borderRadius: liqiComponents.profile.pillRadius,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    minHeight: liqiComponents.profile.pillHeight,
    paddingHorizontal: liqiSpacing.lg,
  },
  pillText: {
    ...liqiTypography.caption,
    fontWeight: '700',
  },
  primaryAction: {
    borderColor: liqiComponents.button.contentBorder,
    shadowColor: liqiShadow.purpleGlow.shadowColor,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  surface: {
    ...liqiShadow.card,
    backgroundColor: liqiComponentColors.profile.surface,
    borderColor: liqiComponentColors.profile.surfaceBorder,
    borderRadius: liqiComponents.profile.detailCardRadius,
    borderWidth: StyleSheet.hairlineWidth,
    padding: liqiComponents.profile.cardPadding,
  },
  surfaceCompact: {
    padding: liqiComponents.profile.cardPaddingCompact,
  },
});
