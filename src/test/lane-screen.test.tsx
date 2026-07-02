import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import LaneScreen from '@/app/lane';

describe('LaneScreen', () => {
  it('renders the lane selection step', async () => {
    const { getAllByText, getByText } = await render(<LaneScreen />);

    expect(getByText('VỊ TRÍ SỞ TRƯỜNG')).toBeTruthy();
    expect(getAllByText('Đi Rừng').length).toBeGreaterThan(0);
    expect(getByText('Tiếp tục')).toBeTruthy();
  });
});
