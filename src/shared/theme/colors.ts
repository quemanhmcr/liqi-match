export type ColorSchemeName = 'light' | 'dark';

export type SemanticColors = Readonly<{
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  danger: string;
}>;

export const colors: Readonly<Record<ColorSchemeName, SemanticColors>> = {
  light: {
    background: '#F7F8FA',
    surface: '#FFFFFF',
    textPrimary: '#14171F',
    textSecondary: '#5E6675',
    border: '#D9DEE8',
    primary: '#1F6FEB',
    danger: '#C93C3C',
  },
  dark: {
    background: '#111318',
    surface: '#1B1F27',
    textPrimary: '#F4F6FA',
    textSecondary: '#A8B0BF',
    border: '#303642',
    primary: '#78A8FF',
    danger: '#FF8A8A',
  },
};
