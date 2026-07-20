import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Canonical visual foundation for LiQi.
 *
 * Product surfaces must consume semantic/component tokens instead of inventing
 * local values. Primitive palette values intentionally stay private to this
 * module so a future rebrand does not require feature-level edits.
 */
export const liqiDesignVersion = '1.0.0' as const;

const palette = {
  amber: {
    400: '#FFC66D',
    500: '#F7A63E',
  },
  cyan: {
    300: '#67E8FF',
    400: '#37CDFF',
  },
  ink: {
    1000: '#010308',
    950: '#02040B',
    925: '#020510',
    900: '#030711',
    875: '#050814',
    850: '#070A18',
    800: '#080B19',
  },
  mint: {
    400: '#55DF88',
    500: '#16EBB2',
  },
  pink: {
    300: '#FF8DCE',
    400: '#F087D1',
    500: '#ED649D',
    600: '#E54A9F',
  },
  red: {
    400: '#FFB4C5',
    500: '#D95D67',
  },
  violet: {
    200: '#DCA6FF',
    300: '#D693FF',
    350: '#C981FF',
    400: '#C678FF',
    450: '#B76CFF',
    500: '#B34FFF',
    550: '#A884FF',
    600: '#8D4DFF',
    650: '#8056ED',
    700: '#7449E9',
  },
  white: '#FFFFFF',
} as const;

export const liqiColors = {
  accent: {
    amber: palette.amber[400],
    cyan: palette.cyan[400],
    mint: palette.mint[500],
    pink: palette.pink[500],
    purple: palette.violet[500],
    purpleIcon: palette.violet[550],
    purpleSoft: 'rgba(178,92,255,0.42)',
  },
  background: {
    base: palette.ink[900],
    bottom: palette.ink[950],
    deep: palette.ink[875],
    elevated: 'rgba(8,12,26,0.58)',
    elevatedStrong: 'rgba(10,12,26,0.64)',
    overlay: 'rgba(2,5,17,0.72)',
  },
  border: {
    card: 'rgba(176,155,255,0.18)',
    control: 'rgba(153,157,202,0.17)',
    focus: palette.violet[500],
    surface: 'rgba(255,255,255,0.12)',
    surfaceHighlight: 'rgba(255,255,255,0.22)',
    surfaceSoft: 'rgba(255,255,255,0.08)',
    image: 'rgba(174,161,230,0.24)',
    nav: 'rgba(156,157,211,0.15)',
  },
  icon: {
    active: '#C85EFF',
    inactive: 'rgba(187,192,218,0.72)',
    primary: '#F7F4FF',
    purple: palette.violet[550],
  },
  status: {
    danger: palette.red[400],
    info: palette.cyan[300],
    online: palette.mint[400],
    success: '#6DE89B',
    warning: '#FFB86B',
  },
  text: {
    disabled: 'rgba(210,218,245,0.32)',
    inverse: palette.white,
    muted: 'rgba(210,218,245,0.48)',
    onAccent: palette.white,
    primary: 'rgba(248,250,255,0.96)',
    secondary: 'rgba(226,224,240,0.72)',
    tertiary: 'rgba(225,223,239,0.68)',
  },
} as const;

export const liqiGradients = {
  appBackground: [palette.ink[925], '#071126', palette.ink[950]] as const,
  navigationSurface: ['rgba(25,27,50,0.94)', 'rgba(8,12,28,0.97)'] as const,
  heroBottomFade: ['rgba(2,5,17,0)', 'rgba(2,5,17,0.72)'] as const,
  heroLeftFade: [
    'rgba(3,7,22,0.97)',
    'rgba(5,8,24,0.82)',
    'rgba(5,7,21,0.28)',
    'rgba(4,7,20,0.02)',
  ] as const,
  primaryCta: [palette.violet[600], '#C143DD', palette.pink[500]] as const,
  primaryCtaActive: [palette.violet[700], '#A845DA', '#D3569C'] as const,
  primaryOrb: ['#7A45F6', '#B64CF3', '#EC78B9'] as const,
  profileRing: [palette.violet[650], '#D467B8'] as const,
  roomHeart: ['#B669FF', palette.pink[400]] as const,
  surfaceFade: ['rgba(7,8,29,0.12)', 'rgba(6,7,24,0.86)'] as const,
  surfaceFadeStrong: ['rgba(7,8,29,0.18)', 'rgba(5,7,22,0.90)'] as const,
} as const;

/** 2pt base grid. Values outside this scale require a component token. */
export const liqiSpacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
  '3xl': 16,
  '4xl': 18,
  '5xl': 20,
  '6xl': 24,
  '7xl': 28,
  '8xl': 32,
  '9xl': 40,
  '10xl': 48,
} as const;

export const liqiRadius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  pill: 999,
} as const;

export const liqiBreakpoints = {
  compact: 390,
  wide: 430,
} as const;

export function isCompactLiqiViewport(width: number) {
  return width < liqiBreakpoints.compact;
}

export const liqiTouch = {
  minimum: 44,
  preferred: 48,
} as const;

export const liqiOpacity = {
  disabled: 0.48,
  pressed: 0.82,
  subtlePressed: 0.88,
} as const;

export const liqiMotion = {
  pressScale: 0.98,
  subtlePressScale: 0.985,
} as const;

const typographyBase = {
  color: liqiColors.text.primary,
  includeFontPadding: false,
} satisfies TextStyle;

export const liqiTypography = {
  cardTitle: {
    ...typographyBase,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.25,
    lineHeight: 23,
  },
  body: {
    ...typographyBase,
    color: liqiColors.text.secondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
  },
  bodyCompact: {
    ...typographyBase,
    color: liqiColors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
  button: {
    ...typographyBase,
    color: liqiColors.text.onAccent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  buttonCompact: {
    ...typographyBase,
    color: liqiColors.text.onAccent,
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 17,
  },
  cta: {
    ...typographyBase,
    color: liqiColors.text.onAccent,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  caption: {
    ...typographyBase,
    color: liqiColors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  chip: {
    ...typographyBase,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  displayHero: {
    ...typographyBase,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 35,
  },
  displayHeroCompact: {
    ...typographyBase,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.9,
    lineHeight: 33,
  },
  greeting: {
    ...typographyBase,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 23,
  },
  greetingCompact: {
    ...typographyBase,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.25,
    lineHeight: 20,
  },
  label: {
    ...typographyBase,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  screenTitle: {
    ...typographyBase,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  sectionLabel: {
    ...typographyBase,
    color: liqiColors.accent.purple,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 17,
  },
  sectionTitle: {
    ...typographyBase,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  sectionTitleCompact: {
    ...typographyBase,
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.25,
    lineHeight: 19,
  },
  subtitle: {
    ...typographyBase,
    color: liqiColors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  subtitleCompact: {
    ...typographyBase,
    color: liqiColors.text.secondary,
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
  },
} satisfies Record<string, TextStyle>;

export const liqiShadow = {
  card: {
    elevation: 7,
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
  },
  cta: {
    elevation: 5,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  nav: {
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  purpleGlow: {
    shadowColor: '#A348FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.58,
    shadowRadius: 12,
  },
} satisfies Record<string, ViewStyle>;
