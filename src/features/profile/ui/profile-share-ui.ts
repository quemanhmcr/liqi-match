import { appColors, appRadii, appSpacing } from '@/shared/ui';

/** Profile Share-owned visual recipe. Export dimensions are canonical social-media output sizes. */
export const profileShareUi = {
  card: {
    feed: { aspectRatio: 4 / 5, exportHeight: 1350, exportWidth: 1080 },
    square: { aspectRatio: 1, exportHeight: 1080, exportWidth: 1080 },
    story: { aspectRatio: 9 / 16, exportHeight: 1920, exportWidth: 1080 },
  },
  colors: {
    brand: 'rgba(239,233,255,0.92)',
    cardBase: 'rgba(5,8,22,0.98)',
    cardBorder: 'rgba(195,159,255,0.28)',
    cardGlow: 'rgba(142,92,255,0.22)',
    cardScrim: 'rgba(3,6,18,0.82)',
    cardScrimSoft: 'rgba(3,6,18,0.20)',
    controlSurface: 'rgba(8,11,27,0.90)',
    divider: 'rgba(181,161,246,0.14)',
    guardSurface: 'rgba(8,11,27,0.88)',
    posterPill: 'rgba(255,255,255,0.08)',
    posterPillBorder: 'rgba(220,207,255,0.16)',
    statSurface: 'rgba(5,8,22,0.62)',
    statBorder: 'rgba(208,189,255,0.17)',
    statusReady: appColors.status.online,
  },
  gradients: {
    avatarRing: ['#8050E8', '#D76FB8'] as const,
    fallbackCover: ['#251942', '#0C1530', '#050816'] as const,
    fantasyGlow: [
      'rgba(139,91,246,0.24)',
      'rgba(235,112,184,0.10)',
      'rgba(255,255,255,0)',
    ] as const,
    minimalGlow: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)'] as const,
    rankGlow: [
      'rgba(247,198,74,0.20)',
      'rgba(139,91,246,0.10)',
      'rgba(255,255,255,0)',
    ] as const,
    scrim: [
      'rgba(3,6,18,0.28)',
      'rgba(3,6,18,0.58)',
      'rgba(3,6,18,0.94)',
    ] as const,
    sideScrim: [
      'rgba(3,6,18,0.86)',
      'rgba(3,6,18,0.18)',
      'rgba(3,6,18,0.58)',
    ] as const,
  },
  preview: {
    feedWidth: 310,
    squareWidth: 310,
    storyWidth: 238,
  },
  radii: {
    card: appRadii['2xl'],
    control: appRadii.xl,
  },
  screen: {
    bottomContentInset: 118,
    gap: appSpacing['3xl'],
  },
} as const;
