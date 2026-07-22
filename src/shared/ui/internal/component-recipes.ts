import {
  appColors,
  appGradients,
  appRadii,
  appSpacing,
  appTouch,
  appTypography,
} from '../theme/app-theme';

type GradientColors = readonly [string, string, ...string[]];
type Tone = Readonly<{ background: string; border: string; text: string }>;

export const sharedUiRecipes = {
  actionDock: {
    background: 'rgba(5,8,20,0.97)',
    border: 'rgba(181,161,246,0.18)',
    gap: appSpacing.xl,
    minimumBottomInset: appSpacing.md,
    minimumHeight: 76,
    paddingHorizontal: appSpacing['3xl'],
    paddingTop: appSpacing.md,
  },
  appBackground: {
    bottomFade: 'rgba(1,3,8,0.46)',
    cyanAtmosphere: 'rgba(60,210,255,0.016)',
    gradient: appGradients.appBackground,
    purpleAtmosphere: 'rgba(130,80,255,0.020)',
    vignette: 'rgba(0,0,0,0.10)',
  },
  button: {
    contentBorder: 'rgba(255,255,255,0.17)',
    defaultRadius: appRadii['4xl'],
    depthShadow: 'rgba(0,0,0,0.14)',
    edgeLine: 'rgba(255,255,255,0.46)',
    gap: appSpacing.lg,
    minimumHeight: appTouch.minimum,
    paddingHorizontal: appSpacing['2xl'],
    paddingVertical: appSpacing.md,
    sheen: [
      'rgba(255,255,255,0.50)',
      'rgba(255,255,255,0.08)',
      'rgba(255,255,255,0)',
    ] as GradientColors,
    variants: {
      ghost: [
        'rgba(255,255,255,0.08)',
        'rgba(255,255,255,0.018)',
      ] as GradientColors,
      primary: appGradients.primaryCta,
      rank: ['rgba(18,46,72,0.90)', 'rgba(55,142,172,0.86)'] as GradientColors,
      secondary: [
        'rgba(28,31,51,0.72)',
        'rgba(18,20,38,0.56)',
      ] as GradientColors,
      team: ['rgba(96,55,32,0.90)', 'rgba(166,92,56,0.86)'] as GradientColors,
    },
  },
  card: {
    defaultRadius: appRadii['3xl'],
    densityPadding: {
      compact: appSpacing.lg,
      large: appSpacing['4xl'],
      list: appSpacing.lg,
      regular: appSpacing['2xl'],
    },
  },
  chip: {
    compactHeight: 30,
    gap: appSpacing.sm,
    height: 32,
    hitSlop: appSpacing.sm,
    paddingHorizontal: appSpacing.lg,
    sheen: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.025)'] as const,
    tagGap: appSpacing.xs,
    tagHeight: 24,
    tagPaddingHorizontal: 7,
    tagTones: {
      cyan: {
        background: 'rgba(55,145,255,0.046)',
        border: 'rgba(103,232,255,0.11)',
        text: 'rgba(186,239,255,0.68)',
      },
      default: {
        background: 'rgba(255,255,255,0.045)',
        border: 'rgba(255,255,255,0.10)',
        text: 'rgba(220,226,245,0.74)',
      },
      orange: {
        background: 'rgba(255,145,74,0.055)',
        border: 'rgba(255,178,104,0.15)',
        text: 'rgba(255,211,168,0.76)',
      },
      purple: {
        background: 'rgba(148,92,220,0.075)',
        border: 'rgba(194,138,255,0.16)',
        text: 'rgba(231,216,255,0.76)',
      },
      selected: {
        background: 'rgba(96,106,255,0.11)',
        border: 'rgba(178,198,255,0.15)',
        text: 'rgba(238,246,255,0.82)',
      },
    } satisfies Record<string, Tone>,
    tones: {
      cyan: {
        background: 'rgba(55,145,255,0.075)',
        border: 'rgba(103,232,255,0.16)',
        text: 'rgba(189,244,255,0.82)',
      },
      default: {
        background: 'rgba(255,255,255,0.065)',
        border: 'rgba(255,255,255,0.14)',
        text: '#BAC3DA',
      },
      orange: {
        background: 'rgba(255,138,61,0.075)',
        border: 'rgba(255,155,80,0.22)',
        text: '#FFB264',
      },
      purple: {
        background: 'rgba(162,92,255,0.12)',
        border: 'rgba(176,119,255,0.30)',
        text: '#E6D2FF',
      },
      selected: {
        background: 'rgba(96,106,255,0.17)',
        border: 'rgba(178,198,255,0.22)',
        text: 'rgba(246,249,255,0.90)',
      },
    } satisfies Record<string, Tone>,
  },
  identityHeader: {
    avatar: 48,
    avatarCompact: 42,
    emphasizedAction: 48,
    emphasizedActionCompact: 42,
    minHeight: 58,
    minHeightCompact: 50,
    plainActionHeight: 44,
    plainActionHeightCompact: 38,
    plainActionWidth: 40,
    plainActionWidthCompact: 34,
  },
  notice: {
    actionGap: appSpacing.md,
    copyGap: appSpacing.xs,
    gap: appSpacing.lg,
    iconSize: 34,
    padding: appSpacing.xl,
    radius: appRadii.lg,
    tones: {
      danger: {
        background: 'rgba(217,93,103,0.10)',
        border: 'rgba(255,180,197,0.22)',
        icon: appColors.status.danger,
        iconSurface: 'rgba(217,93,103,0.14)',
      },
      info: {
        background: 'rgba(55,205,255,0.08)',
        border: 'rgba(103,232,255,0.18)',
        icon: appColors.status.info,
        iconSurface: 'rgba(55,205,255,0.12)',
      },
      neutral: {
        background: 'rgba(116,76,210,0.10)',
        border: 'rgba(174,142,255,0.22)',
        icon: appColors.accent.purpleIcon,
        iconSurface: 'rgba(132,85,226,0.14)',
      },
      success: {
        background: 'rgba(109,232,155,0.08)',
        border: 'rgba(109,232,155,0.18)',
        icon: appColors.status.success,
        iconSurface: 'rgba(109,232,155,0.12)',
      },
      warning: {
        background: 'rgba(247,166,62,0.08)',
        border: 'rgba(255,184,107,0.20)',
        icon: appColors.status.warning,
        iconSurface: 'rgba(247,166,62,0.12)',
      },
    },
  },
  screen: {
    bottomNavSpacer: 240,
    gutter: appSpacing['4xl'],
    gutterCompact: appSpacing['2xl'],
    topPadding: appSpacing.xs,
  },
  sectionHeader: {
    label: appTypography.sectionLabel,
    marginTop: 15,
    title: appTypography.sectionTitle,
  },
  textField: {
    accessoryPadding: appSpacing.md,
    background: 'rgba(255,255,255,0.045)',
    border: 'rgba(190,218,255,0.13)',
    fontSize: 14,
    fontWeight: '600' as const,
    gap: appSpacing.sm,
    minimumHeight: appTouch.minimum,
    multilineMinimumHeight: 92,
    multilinePaddingTop: appSpacing.xl,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.lg,
    radius: appRadii.md,
  },
  surface: {
    background: {
      high: 'rgba(8,12,26,0.97)',
      low: 'rgba(8,12,26,0.78)',
      medium: 'rgba(8,12,26,0.90)',
    },
    highlight: [
      'rgba(255,255,255,0.08)',
      'rgba(255,255,255,0.015)',
      'rgba(3,7,20,0.18)',
    ] as const,
    overlay: 'rgba(3,6,18,0.18)',
    radius: {
      button: appRadii.pill,
      card: appRadii['4xl'],
      chip: appRadii.pill,
      nav: 38,
      orb: appRadii.pill,
    },
  },
} as const;

export const sharedUiColors = {
  identityHeader: {
    actionBorder: 'rgba(150,103,255,0.26)',
    actionShadow: '#7B52FF',
    avatarFrame: '#070A18',
    indicator: '#A15CFF',
    indicatorBorder: '#080B19',
  },
} as const;

export const sharedUiGradients = {
  identityHeader: {
    action: ['rgba(91,52,178,0.58)', 'rgba(34,27,85,0.82)'] as const,
    avatarRing: appGradients.profileRing,
  },
} as const;

export const sharedUiSemanticColors = appColors;
