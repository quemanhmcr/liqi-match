import type { ReactNode } from 'react';
import {
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { appColors, appTypography } from './theme/app-theme';

export type AppTextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'button';

export type AppTextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'muted'
  | 'accent'
  | 'danger'
  | 'success'
  | 'warning'
  | 'inherit';

export type AppTextProps = Omit<TextProps, 'children' | 'style'> &
  Readonly<{
    children: ReactNode;
    compact?: boolean;
    style?: StyleProp<TextStyle>;
    tone?: AppTextTone;
    variant?: AppTextVariant;
  }>;

const variantStyles: Record<AppTextVariant, TextStyle> = {
  body: appTypography.body,
  bodySmall: appTypography.bodyCompact,
  button: appTypography.button,
  caption: appTypography.caption,
  display: appTypography.displayHero,
  h1: appTypography.screenTitle,
  h2: appTypography.cardTitle,
  h3: appTypography.sectionTitle,
  label: appTypography.label,
};

const compactVariantStyles: Partial<Record<AppTextVariant, TextStyle>> = {
  display: appTypography.displayHeroCompact,
  h2: appTypography.greetingCompact,
  h3: appTypography.sectionTitleCompact,
};

const toneColors: Record<Exclude<AppTextTone, 'inherit'>, string> = {
  accent: appColors.accent.purpleIcon,
  danger: appColors.status.danger,
  muted: appColors.text.muted,
  primary: appColors.text.primary,
  secondary: appColors.text.secondary,
  success: appColors.status.success,
  tertiary: appColors.text.tertiary,
  warning: appColors.status.warning,
};

/** Semantic typography derived from the approved Home hierarchy. */
export function AppText({
  children,
  compact = false,
  style,
  tone = 'inherit',
  variant = 'body',
  ...props
}: AppTextProps) {
  return (
    <Text
      {...props}
      style={[
        variantStyles[variant],
        compact && compactVariantStyles[variant],
        tone === 'inherit' ? undefined : { color: toneColors[tone] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
