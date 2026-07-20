import { liqiColors } from './liqi-design-system';

export type ColorSchemeName = 'light' | 'dark';

export type SemanticColors = Readonly<{
  background: string;
  border: string;
  danger: string;
  primary: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
}>;

const canonicalDarkColors: SemanticColors = {
  background: liqiColors.background.base,
  border: liqiColors.border.surface,
  danger: liqiColors.status.danger,
  primary: liqiColors.accent.purple,
  surface: liqiColors.background.elevated,
  textPrimary: liqiColors.text.primary,
  textSecondary: liqiColors.text.secondary,
};

/** @deprecated LiQi is dark-only. Import semantic tokens from liqi-design-system. */
export const colors: Readonly<Record<ColorSchemeName, SemanticColors>> = {
  dark: canonicalDarkColors,
  light: canonicalDarkColors,
};
