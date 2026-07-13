import { describe, expect, it } from '@jest/globals';
import RankSelectionScreen from '@/features/onboarding/screens/RankSelectionScreen';
import { renderWithProviders } from '@/test/render-with-providers';

describe('RankSelectionScreen', () => {
  it('renders the rank selection step', async () => {
    const { getAllByRole, getAllByText, getByText } = await renderWithProviders(
      <RankSelectionScreen />,
    );

    expect(getByText('Bước 2/6')).toBeTruthy();
    expect(getByText('Chọn mức rank hiện tại')).toBeTruthy();
    expect(getAllByText('Cao Thủ').length).toBeGreaterThan(0);
    expect(
      getAllByRole('button').some(
        (button) => button.props.accessibilityState?.selected === true,
      ),
    ).toBe(false);
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });
});
