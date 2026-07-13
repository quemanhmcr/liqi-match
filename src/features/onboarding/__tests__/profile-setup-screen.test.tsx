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
    expect(getByPlaceholderText('Nhập tên hiển thị')).toBeTruthy();
    expect(getByText('Tên trong game')).toBeTruthy();
    expect(getByPlaceholderText('Nhập tên trong game')).toBeTruthy();
    expect(
      getByLabelText('Chọn giới tính Nam').props.accessibilityState.selected,
    ).toBe(false);
    expect(getByText('Tiếp tục')).toBeTruthy();
  });

  it('accepts a display name entry', async () => {
    const { getByPlaceholderText, getByText } = await renderWithProviders(
      <ProfileSetupScreen />,
    );

    await fireEvent.changeText(
      getByPlaceholderText('Nhập tên hiển thị'),
      'Liqi Pro',
    );

    await waitFor(() => {
      expect(getByText('8/20')).toBeTruthy();
    });
  });
});
