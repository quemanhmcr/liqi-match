import { DarkTheme } from 'expo-router';

import { appColors } from '@/shared/ui';

/**
 * Liqi currently has one dark visual system. Keeping the navigator on an
 * OS-dependent light theme exposes the navigation container behind transparent
 * custom chrome, even though every feature screen itself is dark.
 */
export const appNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: appColors.background.base,
    border: 'transparent',
    card: appColors.background.base,
  },
};
