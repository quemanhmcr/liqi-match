import { describe, expect, it } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';

import ProfileSetupScreen from '@/features/onboarding/screens/ProfileSetupScreen';
import { renderWithProviders } from '@/test/render-with-providers';

describe('ProfileSetupScreen', () => {
  it('renders the profile setup first step', async () => {
    const { getByLabelText, getByPlaceholderText, getByText } =
      await renderWithProviders(<ProfileSetupScreen />);

    expect(getByText('Bước 1/6')).toBeTruthy();
    expect(getByText('Tạo hồ sơ')).toBeTruthy();
    expect(getByText('Tên hiển thị')).toBeTruthy();
    expect(getByPlaceholderText('Nhập tên của bạn')).toBeTruthy();
    expect(getByLabelText('Chọn giới tính Nam')).toBeTruthy();
    expect(getByText('Tiếp tục')).toBeTruthy();
    expect(getByText('Để sau')).toBeTruthy();
  });

  it('accepts a display name entry', async () => {
    const { getByPlaceholderText, getByText } = await renderWithProviders(
      <ProfileSetupScreen />,
    );

    await fireEvent.changeText(
      getByPlaceholderText('Nhập tên của bạn'),
      'Liqi Pro',
    );

    await waitFor(() => {
      expect(getByText('8/20')).toBeTruthy();
    });
  });
});
