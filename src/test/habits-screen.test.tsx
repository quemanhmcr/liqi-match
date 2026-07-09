import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HabitsScreen from '@/app/habits';

describe('HabitsScreen', () => {
  it('renders the full connected habits step', async () => {
    const { getAllByText, getByText } = await render(<HabitsScreen />);

    expect(getByText('Bước 5/6')).toBeTruthy();
    expect(getByText('Thói quen chơi đội')).toBeTruthy();
    expect(getByText('Giao tiếp')).toBeTruthy();
    expect(getAllByText(/Ping\/chat/).length).toBeGreaterThan(0);
    expect(getByText('Lối chơi chiến thuật')).toBeTruthy();
    expect(getByText('Không khí đội')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });
});
