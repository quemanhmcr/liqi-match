import { liqiTypography } from './liqi-design-system';

/** @deprecated Import liqiTypography from liqi-design-system. */
export const typography = {
  body: liqiTypography.body,
  caption: liqiTypography.caption,
  title: liqiTypography.screenTitle,
} as const;
