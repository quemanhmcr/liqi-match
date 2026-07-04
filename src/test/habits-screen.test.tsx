import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import HabitsScreen from '@/app/habits';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('HabitsScreen', () => {
  it('renders the premium habits step', async () => {
    const { getByText } = await render(<HabitsScreen />);

    expect(getByText('4/5')).toBeTruthy();
    expect(getByText('thói quen')).toBeTruthy();
    expect(getByText('Kênh giao tiếp')).toBeTruthy();
    expect(getByText('Cách ra quyết định')).toBeTruthy();
    expect(getByText('Thời gian thường online')).toBeTruthy();
    expect(getByText('Mục tiêu tìm đồng đội')).toBeTruthy();
    expect(getByText('Hồ sơ ghép đội')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
  });

  it('updates the summary when selecting a communication channel', async () => {
    const { getByText } = await render(<HabitsScreen />);

    fireEvent.press(getByText('Voice chủ động'));

    expect(getByText('Voice chủ động')).toBeTruthy();
  });
});
