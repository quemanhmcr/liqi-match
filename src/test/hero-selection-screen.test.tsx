import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import HeroSelectionScreen from '@/app/hero-selection';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('HeroSelectionScreen', () => {
  it('renders the connected hero selection step', async () => {
    const { getByText } = await render(<HeroSelectionScreen />);

    expect(getByText('Bước 3/5')).toBeTruthy();
    expect(getByText('Chọn 3 tướng yêu thích')).toBeTruthy();
    expect(getByText('Edras')).toBeTruthy();
    expect(getByText('Goverra')).toBeTruthy();
    expect(getByText('Heino')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
  });

  it('keeps exactly three selected heroes when selecting another hero', async () => {
    const { getByText } = await render(<HeroSelectionScreen />);

    fireEvent.press(getByText('Billow'));

    expect(getByText('Đã chọn 3/3')).toBeTruthy();
    expect(getByText('Billow')).toBeTruthy();
  });
});
