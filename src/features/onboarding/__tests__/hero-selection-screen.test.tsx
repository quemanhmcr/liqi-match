import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';

import HeroSelectionScreen from '@/features/onboarding/screens/HeroSelectionScreen';
import { renderWithProviders } from '@/test/render-with-providers';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('HeroSelectionScreen', () => {
  it('renders the connected hero selection step', async () => {
    const { getAllByText, getByText } = await renderWithProviders(
      <HeroSelectionScreen />,
    );

    expect(getByText('Bước 4/6')).toBeTruthy();
    expect(getByText('Chọn 3 tướng tủ')).toBeTruthy();
    expect(getAllByText('Edras').length).toBeGreaterThan(0);
    expect(getAllByText('Goverra').length).toBeGreaterThan(0);
    expect(getAllByText('Heino').length).toBeGreaterThan(0);
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });

  it('keeps exactly three selected heroes when selecting another hero', async () => {
    const { getByText } = await renderWithProviders(<HeroSelectionScreen />);

    fireEvent.press(getByText('Billow'));

    expect(getByText(/Đã chọn 3\/3/)).toBeTruthy();
    expect(getByText('Billow')).toBeTruthy();
  });

  it('keeps the selected hero tray stable when fewer than three heroes are selected', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(
      <HeroSelectionScreen />,
    );

    fireEvent.press(getByLabelText('Xoá tướng Edras'));

    await waitFor(() => {
      expect(getByText(/Đã chọn 2\/3/)).toBeTruthy();
      expect(getByLabelText('Ô tướng trống 3')).toBeTruthy();
    });
  });
});
