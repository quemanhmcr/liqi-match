import type { TextStyle, ViewStyle } from 'react-native';

export const liquidColors = {
  background: {
    base: '#030711',
    deep: '#050814',
    elevated: 'rgba(8, 12, 26, 0.58)',
    elevatedStrong: 'rgba(10, 12, 26, 0.64)',
  },

  text: {
    primary: 'rgba(248,250,255,0.96)',
    secondary: 'rgba(220,226,255,0.68)',
    muted: 'rgba(210,218,245,0.48)',
    disabled: 'rgba(210,218,245,0.32)',
  },

  accent: {
    purple: 'rgba(178, 92, 255, 0.92)',
    purpleSoft: 'rgba(178, 92, 255, 0.42)',
    cyan: 'rgba(55, 205, 255, 0.88)',
    cyanSoft: 'rgba(55, 205, 255, 0.34)',
    mint: 'rgba(22, 235, 178, 0.90)',
    orange: 'rgba(255, 154, 68, 0.72)',
    pink: 'rgba(235, 70, 150, 0.72)',
  },

  stroke: {
    base: 'rgba(255,255,255,0.12)',
    baseSoft: 'rgba(255,255,255,0.08)',
    highlight: 'rgba(255,255,255,0.22)',
  },
} as const;

export const liquidGlass = {
  surface: {
    background: 'rgba(8, 12, 26, 0.56)',
    backgroundStrong: 'rgba(8, 12, 26, 0.66)',
    tint: 'rgba(3, 6, 18, 0.28)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 0.8,
  },

  blur: {
    androidIntensity: 24,
    iosIntensity: 30,
    navIntensity: 24,
    cardIntensity: 28,
  },

  radius: {
    card: 28,
    button: 999,
    chip: 999,
    nav: 38,
    orb: 999,
  },
} as const;

export const liquidEdgeGlow = {
  pad: 16,

  // Full base stroke must stay very light. The main light belongs to short
  // asymmetric segment glow, not to an always-on full-card border.
  baseStroke: {
    width: 0.8,
    opacity: 0.22,
  },

  hairline: {
    width: 0.9,
    opacity: 0.52,
  },

  bloom: {
    width: 5.2,
    blur: 10,
    opacity: 0.28,
  },

  cta: {
    pad: 14,
    baseStrokeOpacity: 0.16,
    hairlineOpacity: 0.62,
    bloomOpacity: 0.3,
    bloomBlur: 10,
    bloomWidth: 5.6,
  },
} as const;

export type LiquidGlassIntensity = 'low' | 'medium' | 'high';
export type LiquidGlowIntensity = 'none' | 'low' | 'medium' | 'high';

export const liquidRuntime = {
  reducedTransparency: false,
  lowPerformanceMode: false,
} as const;

export const liquidGlassIntensityScale: Record<
  LiquidGlassIntensity,
  { blurMultiplier: number; surfaceBackground: string }
> = {
  low: {
    blurMultiplier: 0.68,
    surfaceBackground: 'rgba(10, 14, 30, 0.76)',
  },
  medium: {
    blurMultiplier: 1,
    surfaceBackground: liquidGlass.surface.background,
  },
  high: {
    blurMultiplier: 1.12,
    surfaceBackground: liquidGlass.surface.backgroundStrong,
  },
};

export const liquidGlowIntensityScale: Record<
  LiquidGlowIntensity,
  {
    bloomOpacityMultiplier: number;
    lineOpacityMultiplier: number;
    widthMultiplier: number;
  }
> = {
  none: {
    bloomOpacityMultiplier: 0,
    lineOpacityMultiplier: 0,
    widthMultiplier: 0,
  },
  low: {
    bloomOpacityMultiplier: 0.42,
    lineOpacityMultiplier: 0.48,
    widthMultiplier: 0.82,
  },
  medium: {
    bloomOpacityMultiplier: 1,
    lineOpacityMultiplier: 1,
    widthMultiplier: 1,
  },
  high: {
    bloomOpacityMultiplier: 1.1,
    lineOpacityMultiplier: 1.04,
    widthMultiplier: 1.04,
  },
};

export const liquidLayout = {
  bottomNavSpacer: 240,
} as const;

export const liquidShadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },

  cta: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  nav: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;

export const liquidTypography = {
  screenGreeting: {
    fontSize: 18,
    fontWeight: '600',
    color: liquidColors.text.secondary,
  },

  screenName: {
    fontSize: 26,
    fontWeight: '800',
    color: liquidColors.text.primary,
    letterSpacing: -0.5,
  },

  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: liquidColors.text.primary,
    letterSpacing: -0.3,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(185, 115, 255, 0.92)',
    letterSpacing: 0.8,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: liquidColors.text.primary,
    letterSpacing: -0.3,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: liquidColors.text.primary,
    letterSpacing: -0.25,
  },

  body: {
    fontSize: 14,
    fontWeight: '500',
    color: liquidColors.text.secondary,
  },

  chip: {
    fontSize: 13,
    fontWeight: '600',
  },

  cta: {
    fontSize: 16,
    fontWeight: '700',
  },
} satisfies Record<string, TextStyle>;
