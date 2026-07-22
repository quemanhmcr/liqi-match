import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { View, type ScrollView } from 'react-native';

import { AppScreen } from '@/shared/ui';

describe('AppScreen composition contracts', () => {
  it('renders a feature-owned background behind screen content', async () => {
    const screen = await render(
      <AppScreen
        backgroundSlot={<View testID="app-screen-background-slot" />}
        scroll={false}
        withHeader={false}
      >
        <View testID="app-screen-content" />
      </AppScreen>,
    );

    expect(screen.getByTestId('app-screen-background-slot')).toBeTruthy();
    expect(screen.getByTestId('app-screen-content')).toBeTruthy();
  });

  it('forwards the native ScrollView ref for semantic measurement', async () => {
    const scrollViewRef = jest.fn<(instance: ScrollView | null) => void>();

    await render(
      <AppScreen scrollViewRef={scrollViewRef} withHeader={false}>
        <View />
      </AppScreen>,
    );

    expect(scrollViewRef).toHaveBeenCalledWith(expect.anything());
  });
});
