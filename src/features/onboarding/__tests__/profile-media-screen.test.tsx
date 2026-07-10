import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';

import ProfileMediaScreen from '@/features/onboarding/screens/ProfileMediaScreen';
import { renderWithProviders } from '@/test/render-with-providers';

jest.mock('@/features/onboarding/services/onboarding-profile-service', () => ({
  completeOnboardingProfile: jest.fn(async () => true),
}));

describe('ProfileMediaScreen', () => {
  it('renders the full connected profile media step', async () => {
    const { getByText } = await renderWithProviders(<ProfileMediaScreen />);

    expect(getByText('Bước 6/6')).toBeTruthy();
    expect(getByText('Hoàn tất hồ sơ')).toBeTruthy();
    expect(getByText('Ảnh đại diện')).toBeTruthy();
    expect(getByText('Ảnh hồ sơ game')).toBeTruthy();
    expect(getByText('Tường ảnh')).toBeTruthy();
    expect(getByText('Tạo hồ sơ')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });

  it('opens the avatar source picker', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(
      <ProfileMediaScreen />,
    );

    fireEvent.press(getByLabelText('Chọn ảnh đại diện'));

    await waitFor(() => {
      expect(getByText('Thêm ảnh đại diện')).toBeTruthy();
    });
    expect(getByText('Chọn từ thư viện')).toBeTruthy();
    expect(getByText('Chụp ảnh mới')).toBeTruthy();
  });

  it('submits the connected profile flow', async () => {
    const { getByText } = await renderWithProviders(<ProfileMediaScreen />);

    fireEvent.press(getByText('Tạo hồ sơ'));

    expect(getByText('Tạo hồ sơ')).toBeTruthy();
    expect(getByText('Quay lại')).toBeTruthy();
  });
});
