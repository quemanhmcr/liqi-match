import { appRadii, appSpacing } from '@/shared/ui';

/** Profile Edit-owned visual recipe. Business sections remain independent; UI categories only group them for navigation. */
export const profileEditUi = {
  category: {
    gap: appSpacing.md,
    minHeight: 66,
  },
  colors: {
    backdrop: 'rgba(2,5,17,0.72)',
    divider: 'rgba(181,161,246,0.12)',
    panel: 'rgba(8,11,27,0.90)',
    previewScrim: 'rgba(3,6,18,0.76)',
    previewScrimSoft: 'rgba(3,6,18,0.26)',
    quickPreviewBorder: 'rgba(181,161,246,0.22)',
    quickPreviewSurface: 'rgba(9,12,28,0.96)',
    selectedSurface: 'rgba(132,85,226,0.14)',
  },
  gradients: {
    avatarRing: ['#8050E8', '#D76FB8'] as const,
    fallbackCover: ['#171A35', '#291744', '#080B1B'] as const,
  },
  preview: {
    avatar: 66,
    coverAspectRatio: 2.15,
    radius: appRadii.xl,
  },
  radii: {
    category: appRadii.lg,
    panel: appRadii.xl,
    sheet: appRadii['3xl'],
  },
  screen: {
    bottomContentInset: 112,
    gap: appSpacing['3xl'],
  },
} as const;
