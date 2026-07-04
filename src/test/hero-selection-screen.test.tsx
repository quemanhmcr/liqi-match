import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import HeroSelectionScreen from '@/app/hero-selection';
import { HEROES } from '@/features/onboarding/hero-selection-data';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('HeroSelectionScreen', () => {
  it('renders the hero selection step with the 128 hero roster', async () => {
    const { getAllByText, getByPlaceholderText, getByText } = await render(
      <HeroSelectionScreen />,
    );

    expect(HEROES).toHaveLength(128);
    expect(getByText('3/5')).toBeTruthy();
    expect(getByText('Chọn')).toBeTruthy();
    expect(getByText('3 tướng tủ')).toBeTruthy();
    expect(getByPlaceholderText('Tìm theo tên tướng')).toBeTruthy();
    expect(getByText('128 tướng')).toBeTruthy();
    expect(getAllByText('Heino').length).toBeGreaterThan(0);
    expect(getByText('Tiếp tục')).toBeTruthy();
  });

  it('opens a replacement sheet when selecting a fourth hero', async () => {
    const { getAllByText, getByLabelText, getByText } = await render(
      <HeroSelectionScreen />,
    );

    fireEvent.press(getByLabelText('Chọn Flowborn, Xạ thủ'));

    await waitFor(() => expect(getByText(/Thay tướng nào bằng/)).toBeTruthy());
    expect(getAllByText('Flowborn').length).toBeGreaterThan(0);
    expect(getByText('Hủy')).toBeTruthy();
  });
});
