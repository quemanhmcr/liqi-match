import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AppText, appColors, appTypography } from '@/shared/ui';

describe('AppText', () => {
  it('maps h1, h2 and h3 to the approved Home hierarchy', async () => {
    const screen = await render(
      <>
        <AppText testID="text-h1" variant="h1">
          H1
        </AppText>
        <AppText testID="text-h2" variant="h2">
          H2
        </AppText>
        <AppText testID="text-h3" variant="h3">
          H3
        </AppText>
      </>,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('text-h1').props.style),
    ).toMatchObject(appTypography.screenTitle);
    expect(
      StyleSheet.flatten(screen.getByTestId('text-h2').props.style),
    ).toMatchObject(appTypography.cardTitle);
    expect(
      StyleSheet.flatten(screen.getByTestId('text-h3').props.style),
    ).toMatchObject(appTypography.sectionTitle);
  });

  it('applies semantic tone after typography defaults and allows local overrides', async () => {
    const screen = await render(
      <AppText
        style={{ fontWeight: '900' }}
        testID="accent-label"
        tone="accent"
        variant="label"
      >
        Accent
      </AppText>,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('accent-label').props.style),
    ).toMatchObject({
      color: appColors.accent.purpleIcon,
      fontSize: appTypography.label.fontSize,
      fontWeight: '900',
      lineHeight: appTypography.label.lineHeight,
    });
  });
});
