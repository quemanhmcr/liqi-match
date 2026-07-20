import { appColors, appGradients } from '@/shared/ui';

/** App-shell-owned navigation presentation; feature screens must not consume it. */
export const mainTabBarUi = {
  colors: {
    active: appColors.icon.active,
    activeBackground: 'rgba(121,62,223,0.07)',
    activeGlow: '#A843FF',
    centerHighlight: 'rgba(255,255,255,0.13)',
    centerIcon: '#FFD5ED',
    centerStroke: 'rgba(255,255,255,0.24)',
    inactive: appColors.icon.inactive,
    label: 'rgba(190,194,218,0.70)',
    labelActive: '#D779FF',
    surface: 'rgba(8,11,27,0.82)',
  },
  gradients: {
    background: appGradients.navigationSurface,
    centerOrb: appGradients.primaryOrb,
  },
  metrics: {
    centerOrb: 72,
    centerOrbCompact: 62,
    itemHeight: 58,
    itemHeightCompact: 52,
    radius: 27,
    radiusCompact: 24,
    sideGroupHeight: 64,
    sideGroupHeightCompact: 58,
    surfaceHeight: 70,
    surfaceHeightCompact: 64,
  },
} as const;
