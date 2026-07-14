import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DeferredVibeDiscoveryScreen } from '../screens/DiscoverVibesScreen';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

const initialMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

beforeEach(() => {
  mockBack.mockClear();
});

describe('DeferredVibeDiscoveryScreen', () => {
  it('explains the v1 boundary without requiring a repository or network call', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <DeferredVibeDiscoveryScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Vibe discovery chưa bật trong v1')).toBeTruthy();
    expect(
      screen.getByText(/Production Match Loop v1 tập trung vào người chơi/),
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
