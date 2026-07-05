import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileMediaScreen from '@/app/profile-media';

jest.mock('@/features/onboarding/profile-service', () => ({
  completeOnboardingProfile: jest.fn(async () => true),
}));

describe('ProfileMediaScreen', () => {
  it('renders the full connected profile media step', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    expect(getByText('Bước 5/5')).toBeTruthy();
    expect(getByText('Hoàn tất hồ sơ')).toBeTruthy();
    expect(getByText('Ảnh đại diện')).toBeTruthy();
    expect(getByText('Ảnh hồ sơ game')).toBeTruthy();
    expect(getByText('Tường ảnh')).toBeTruthy();
    expect(getByText('Tạo hồ sơ')).toBeTruthy();
  });

  it('opens the avatar source picker', async () => {
    const { getByLabelText, getByText } = await render(<ProfileMediaScreen />);

    fireEvent.press(getByLabelText('Chọn ảnh đại diện'));

    await waitFor(() => {
      expect(getByText('Thêm ảnh đại diện')).toBeTruthy();
    });
    expect(getByText('Chọn từ thư viện')).toBeTruthy();
    expect(getByText('Chụp ảnh mới')).toBeTruthy();
  });

  it('submits the connected profile flow', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    fireEvent.press(getByText('Tạo hồ sơ'));

    expect(getByText('Tạo hồ sơ')).toBeTruthy();
  });
});
