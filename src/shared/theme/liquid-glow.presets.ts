import type { EdgeGlowSegment } from '@/shared/components/liquid/LiquidEdgeGlow';

export type LiquidGlowPreset = readonly EdgeGlowSegment[];

// Segment glow is intentionally short and asymmetric. Bloom spans should feel a
// touch softer than the hairline so endpoints dissolve instead of drawing dashes.
export const heroGlowSegments = [
  {
    bloomOpacity: 0.15,
    bloomWidth: 4.8,
    blur: 12,
    color: 'rgba(154,126,255,0.48)',
    end: 0.052,
    id: 'hero-purple-top',
    lineOpacity: 0.34,
    lineWidth: 0.74,
    start: 0,
  },
  {
    bloomOpacity: 0.09,
    bloomWidth: 4.5,
    blur: 12,
    color: 'rgba(132,103,255,0.30)',
    end: 1,
    id: 'hero-purple-wrap',
    lineOpacity: 0.18,
    lineWidth: 0.70,
    start: 0.97,
  },
  {
    bloomOpacity: 0.18,
    bloomWidth: 5.1,
    blur: 13,
    color: 'rgba(103,232,255,0.58)',
    end: 0.512,
    id: 'hero-cyan-right',
    lineOpacity: 0.32,
    lineWidth: 0.76,
    start: 0.39,
  },
  {
    bloomOpacity: 0.07,
    bloomWidth: 4.4,
    blur: 12,
    color: 'rgba(79,219,255,0.34)',
    end: 0.615,
    id: 'hero-blue-lower',
    lineOpacity: 0.10,
    lineWidth: 0.68,
    start: 0.525,
  },
] as const satisfies LiquidGlowPreset;

export const matchedPurpleGlowSegments = [
  {
    bloomOpacity: 0.12,
    bloomWidth: 4.3,
    blur: 11,
    color: 'rgba(203,151,255,0.66)',
    end: 0.073,
    id: 'match-purple-top-left',
    lineOpacity: 0.30,
    lineWidth: 0.72,
    start: 0,
  },
  {
    bloomOpacity: 0.08,
    bloomWidth: 4.1,
    blur: 11,
    color: 'rgba(203,151,255,0.66)',
    end: 1,
    id: 'match-purple-left-wrap',
    lineOpacity: 0.25,
    lineWidth: 0.68,
    start: 0.968,
  },
  {
    bloomOpacity: 0.14,
    bloomWidth: 4.9,
    blur: 12,
    color: 'rgba(230,210,255,0.92)',
    end: 0.512,
    id: 'match-purple-right-corner',
    lineOpacity: 0.30,
    lineWidth: 0.74,
    start: 0.398,
  },
  {
    bloomOpacity: 0.07,
    bloomWidth: 4.2,
    blur: 11,
    color: 'rgba(203,151,255,0.66)',
    end: 0.63,
    id: 'match-purple-lower-right',
    lineOpacity: 0.14,
    lineWidth: 0.68,
    start: 0.555,
  },
] as const satisfies LiquidGlowPreset;

export const rankCyanGlowSegments = [
  {
    bloomOpacity: 0.11,
    bloomWidth: 4.2,
    blur: 11,
    color: 'rgba(80,190,255,0.34)',
    end: 0.07,
    id: 'rank-cyan-top-left',
    lineOpacity: 0.28,
    lineWidth: 0.70,
    start: 0,
  },
  {
    bloomOpacity: 0.14,
    bloomWidth: 4.9,
    blur: 12,
    color: 'rgba(103,232,255,0.62)',
    end: 0.51,
    id: 'rank-cyan-right',
    lineOpacity: 0.30,
    lineWidth: 0.74,
    start: 0.40,
  },
] as const satisfies LiquidGlowPreset;

export const teamOrangeGlowSegments = [
  {
    bloomOpacity: 0.07,
    bloomWidth: 4.0,
    blur: 11,
    color: 'rgba(255,155,80,0.42)',
    end: 0.075,
    id: 'team-orange-top-left',
    lineOpacity: 0.18,
    lineWidth: 0.68,
    start: 0,
  },
  {
    bloomOpacity: 0.075,
    bloomWidth: 4.2,
    blur: 11,
    color: 'rgba(255,123,47,0.42)',
    end: 0.63,
    id: 'team-orange-lower-right',
    lineOpacity: 0.16,
    lineWidth: 0.68,
    start: 0.555,
  },
] as const satisfies LiquidGlowPreset;

export const ctaPurpleCyanGlowSegments = [
  {
    bloomOpacity: 0.17,
    bloomWidth: 4.4,
    blur: 10,
    color: 'rgba(224,156,255,0.58)',
    end: 0.125,
    id: 'cta-purple-top',
    lineOpacity: 0.58,
    lineWidth: 0.76,
    start: 0,
  },
  {
    bloomOpacity: 0.19,
    bloomWidth: 4.7,
    blur: 11,
    color: 'rgba(90,226,255,0.48)',
    end: 0.50,
    id: 'cta-cyan-right',
    lineOpacity: 0.46,
    lineWidth: 0.78,
    start: 0.39,
  },
] as const satisfies LiquidGlowPreset;

export const profileFantasyBlueGlowSegments = [
  {
    bloomOpacity: 0.11,
    bloomWidth: 4.2,
    blur: 10,
    color: 'rgba(118,112,255,0.34)',
    end: 0.115,
    id: 'profile-energy-violet-top',
    lineOpacity: 0.24,
    lineWidth: 0.72,
    start: 0,
  },
  {
    bloomOpacity: 0.26,
    bloomWidth: 5.8,
    blur: 13,
    color: 'rgba(103,232,255,0.66)',
    end: 0.505,
    id: 'profile-energy-frost-right',
    lineOpacity: 0.58,
    lineWidth: 0.80,
    start: 0.382,
  },
  {
    bloomOpacity: 0.15,
    bloomWidth: 5.0,
    blur: 12,
    color: 'rgba(79,219,255,0.42)',
    end: 0.62,
    id: 'profile-energy-cyan-lower',
    lineOpacity: 0.25,
    lineWidth: 0.70,
    start: 0.535,
  },
] as const satisfies LiquidGlowPreset;

export const navActiveGlowSegments = [
  {
    bloomOpacity: 0.07,
    bloomWidth: 3.4,
    blur: 9,
    color: 'rgba(103,232,255,0.24)',
    end: 0.10,
    id: 'nav-active-top-left',
    lineOpacity: 0.18,
    lineWidth: 0.58,
    start: 0,
  },
] as const satisfies LiquidGlowPreset;
