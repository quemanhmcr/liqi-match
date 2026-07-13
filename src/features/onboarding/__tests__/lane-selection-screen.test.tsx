import { describe, expect, it } from '@jest/globals';
import LaneSelectionScreen from '@/features/onboarding/screens/LaneSelectionScreen';
import { renderWithProviders } from '@/test/render-with-providers';

describe('LaneSelectionScreen', () => {
  it('renders the lane selection step', async () => {
    const { getByText } = await renderWithProviders(<LaneSelectionScreen />);

    expect(getByText('Bước 3/6')).toBeTruthy();
    expect(getByText('Chọn lane của bạn')).toBeTruthy();
    expect(getByText('Đi Rừng')).toBeTruthy();
    expect(getByText('Đã chọn 0/2 lane')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });
});
