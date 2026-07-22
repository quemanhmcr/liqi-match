import {
  appColors,
  appGradients,
  appRadii,
  appSpacing,
  appTouch,
} from '@/shared/ui';

/**
 * Profile-owned visual recipe.
 * Shared semantics come from @/shared/ui; exact Profile composition values stay here.
 */
export const profileUi = {
  artwork: {
    ambientBlur: 14,
    ambientOpacity: 0.58,
    playStyleSafeInsetBottom: '18%' as const,
    playStyleSafeInsetHorizontal: '6%' as const,
    playStyleSafeInsetTop: '4%' as const,
    remoteTransitionMs: 120,
  },
  affinity: {
    iconSize: 28,
    iconSizeCompact: 24,
    minHeight: 86,
    minHeightCompact: 64,
  },
  card: {
    borderOpacity: 0.62,
    trustAccentWidth: 3,
    trustBorderOpacity: 0.9,
  },
  colors: {
    artworkScrim: 'rgba(2,5,17,0.62)',
    artworkScrimStrong: 'rgba(2,5,17,0.88)',
    artworkAmbientVeil: 'rgba(3,7,18,0.26)',
    avatarFallback: 'rgba(126,88,218,0.28)',
    coverFallback: ['#12162B', '#241442', '#070A18'] as const,
    divider: 'rgba(176,155,255,0.12)',
    heroIdentity: 'rgba(3,7,17,0.98)',
    iconSurface: 'rgba(130,76,220,0.12)',
    relationshipSurface: 'rgba(9,12,27,0.82)',
    staleSurface: 'rgba(247,166,62,0.09)',
    trustAccent: 'rgba(216,126,255,0.86)',
    trustBorder: 'rgba(191,133,255,0.34)',
    trustSurface: 'rgba(19,13,39,0.94)',
    socialStatsBorder: 'rgba(182,153,255,0.10)',
    trustEvidenceBorder: 'rgba(174,142,255,0.22)',
    trustEvidenceSurface: 'rgba(116,76,210,0.10)',
  },
  hero: {
    actionColumnWidth: 132,
    avatar: 96,
    avatarCompact: 70,
    avatarRingWidth: 3,
    coverHeight: 216,
    coverHeightCompact: 152,
    identityGap: appSpacing['2xl'],
    identityMinHeight: 128,
    identityMinHeightCompact: 96,
    identityPaddingBottom: appSpacing['3xl'],
    identityPaddingBottomCompact: appSpacing.lg,
    identityPaddingHorizontal: appSpacing['4xl'],
    identityPaddingHorizontalCompact: appSpacing['2xl'],
    identityPaddingTop: appSpacing.xl,
    identityPaddingTopCompact: appSpacing.xs,
    identityTopOverlap: 48,
    identityTopOverlapCompact: 32,
    navInset: appSpacing['3xl'],
    navInsetCompact: appSpacing['2xl'],
    navSize: appTouch.minimum,
    presenceSize: 20,
  },
  memory: {
    aspectRatio: 2,
  },
  playStyle: {
    aspectRatio: 3 / 4,
    gap: appSpacing.md,
    tileWidthCompact: 144,
  },
  radii: {
    artwork: appRadii.lg,
    avatar: appRadii.pill,
    card: appRadii.xl,
  },
  socialStats: {
    minHeight: 64,
    minHeightCompact: 58,
  },
  screen: {
    gutter: appSpacing['4xl'],
    gutterCompact: appSpacing['3xl'],
    sectionGap: appSpacing.xl,
    sectionGapCompact: appSpacing.lg,
  },
  shadow: {
    avatar: {
      elevation: 7,
      shadowColor: appColors.accent.purple,
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 11,
    },
  },
  gradients: {
    avatarRing: appGradients.profileRing,
    coverBottom: [
      'rgba(2,5,17,0)',
      'rgba(2,5,17,0.34)',
      'rgba(2,5,17,0.92)',
    ] as const,
    memoryOverlay: [
      'rgba(3,7,18,0.08)',
      'rgba(3,7,18,0.10)',
      'rgba(3,7,18,0.74)',
    ] as const,
    memoryTopOverlay: [
      'rgba(3,7,18,0.76)',
      'rgba(3,7,18,0.34)',
      'rgba(3,7,18,0)',
    ] as const,
    trustFrame: [
      'rgba(205,143,255,0.42)',
      'rgba(116,80,225,0.20)',
      'rgba(255,111,183,0.18)',
    ] as const,
    trustSurface: [
      'rgba(128,72,218,0.15)',
      'rgba(18,15,40,0.94)',
      'rgba(7,10,24,0.96)',
    ] as const,
    tileOverlay: [
      'rgba(3,7,18,0)',
      'rgba(3,7,18,0.06)',
      'rgba(3,7,18,0.72)',
    ] as const,
  },
} as const;
