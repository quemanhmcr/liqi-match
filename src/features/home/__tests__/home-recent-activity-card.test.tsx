import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HomeRecentActivityCard } from '../components/HomeRecentActivityCard';

const image = { uri: 'https://example.invalid/recent-activity.png' };

describe('HomeRecentActivityCard', () => {
  it('preserves the approved regular geometry and exposes one canonical action', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <HomeRecentActivityCard
        badge="MVP"
        compact={false}
        icon="heart"
        image={image}
        meta="12/07 · 3 trận"
        onPress={onPress}
        title="Chiến thắng"
      />,
    );

    const card = screen.getByTestId('home-recent-activity-Chiến thắng');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Chiến thắng, 12/07 · 3 trận');
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({
      borderRadius: 14,
      height: 112,
      overflow: 'hidden',
    });
    expect(screen.getByText('MVP')).toBeTruthy();

    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the approved compact geometry without changing semantics', async () => {
    const screen = await render(
      <HomeRecentActivityCard
        compact
        image={image}
        meta="08/07 · 4 trận"
        onPress={() => undefined}
        title="Chuỗi 4 win"
      />,
    );

    const card = screen.getByRole('button', {
      name: 'Chuỗi 4 win, 08/07 · 4 trận',
    });
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({
      borderRadius: 12,
      height: 94,
    });
  });
});
