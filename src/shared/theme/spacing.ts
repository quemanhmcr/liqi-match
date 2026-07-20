import { liqiSpacing } from './liqi-design-system';

/** @deprecated Import liqiSpacing from liqi-design-system. */
export const spacing = {
  lg: liqiSpacing['6xl'],
  md: liqiSpacing['3xl'],
  sm: liqiSpacing.md,
  xl: liqiSpacing['8xl'],
  xs: liqiSpacing.xs,
} as const;
