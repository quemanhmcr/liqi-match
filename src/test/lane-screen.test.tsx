import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import LaneScreen from '@/app/lane';

describe('LaneScreen', () => {
  it('renders the lane selection step', async () => {
    const { getByText } = await render(<LaneScreen />);

    expect(getByText('Bước 3/6')).toBeTruthy();
    expect(getByText('Chọn lane của bạn')).toBeTruthy();
    expect(getByText('Đi rừng')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });
});
