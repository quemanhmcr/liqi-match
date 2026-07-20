import { describe, expect, it } from '@jest/globals';

import {
  isCompactLiqiViewport,
  liqiBreakpoints,
  liqiColors,
  liqiComponentColors,
  liqiComponents,
  liqiDesignVersion,
  liqiRadius,
  liqiSpacing,
  liqiTouch,
  liqiTypography,
} from '../liqi-design-system';

describe('LiQi design system foundation', () => {
  it('publishes the versioned Home-derived semantic system directly', () => {
    expect(liqiDesignVersion).toBe('1.0.0');
    expect(liqiColors.background.base).toBeTruthy();
    expect(liqiColors.text.primary).toBeTruthy();
    expect(liqiTypography.screenTitle.fontWeight).toBe('800');
    expect(liqiComponents.screen.bottomNavSpacer).toBeGreaterThan(0);
  });

  it('keeps production touch targets and responsive boundaries explicit', () => {
    expect(liqiTouch.minimum).toBeGreaterThanOrEqual(44);
    expect(isCompactLiqiViewport(liqiBreakpoints.compact - 1)).toBe(true);
    expect(isCompactLiqiViewport(liqiBreakpoints.compact)).toBe(false);
    expect(liqiComponents.screen.gutterCompact).toBeLessThan(
      liqiComponents.screen.gutter,
    );
  });

  it('preserves approved reference geometry', () => {
    expect(liqiComponents.home.hero.height).toBe(272);
    expect(liqiComponents.home.contextCard.heightCompact).toBeLessThan(
      liqiComponents.home.contextCard.height,
    );
    expect(liqiComponents.navigation.centerOrbCompact).toBe(62);
    expect(liqiComponents.navigation.centerOrb).toBe(72);
  });

  it('keeps Profile on the Home-derived solid presentation contract', () => {
    expect(liqiComponents.home.header.avatar).toBe(
      liqiComponents.identityHeader.avatar,
    );
    expect(liqiComponents.profile.statIconCompact).toBeLessThan(
      liqiComponents.profile.statIcon,
    );
    expect(liqiComponentColors.profile.surface).toMatch(/^#/);
    expect(liqiComponentColors.profile.surfaceStrong).toMatch(/^#/);
  });

  it('uses an ordered spacing/radius scale and readable typography metrics', () => {
    const spacingValues = Object.values(liqiSpacing);
    const radiusValues = Object.values(liqiRadius).filter(
      (value) => value !== liqiRadius.pill,
    );
    expect(spacingValues).toEqual([...spacingValues].sort((a, b) => a - b));
    expect(radiusValues).toEqual([...radiusValues].sort((a, b) => a - b));

    for (const style of Object.values(liqiTypography)) {
      if (style.fontSize && style.lineHeight) {
        expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
      }
    }
  });
});
