import { describe, expect, it } from '@jest/globals';
import HabitsScreen from '@/features/onboarding/screens/HabitsScreen';
import { renderWithProviders } from '@/test/render-with-providers';

describe('HabitsScreen', () => {
  it('renders the full connected habits step', async () => {
    const { getAllByText, getByLabelText, getByText } =
      await renderWithProviders(<HabitsScreen />);

    expect(getByText('Bước 5/6')).toBeTruthy();
    expect(getByText('Thói quen chơi đội')).toBeTruthy();
    expect(getByText('Giao tiếp')).toBeTruthy();
    expect(getAllByText(/Ping\/chat/).length).toBeGreaterThan(0);
    expect(
      getByLabelText('Ping/chat là chính').props.accessibilityState.selected,
    ).toBe(false);
    expect(getByText('Lối chơi chiến thuật')).toBeTruthy();
    expect(getByText('Không khí đội')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });
});
