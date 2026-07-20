import { liqiRadius } from './liqi-design-system';

/** @deprecated Import liqiRadius from liqi-design-system. */
export const radius = {
  lg: liqiRadius.md,
  md: liqiRadius.xs,
  sm: liqiRadius.xs / 2,
} as const;
