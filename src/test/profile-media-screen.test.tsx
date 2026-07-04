import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileMediaScreen from '@/app/profile-media';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

describe('ProfileMediaScreen', () => {
  it('renders the profile media step', async () => {
    const { getByText } = await render(<ProfileMediaScreen />);

    await waitFor(() => expect(getByText('ảnh hồ sơ')).toBeTruthy());
    expect(getByText('5/5')).toBeTruthy();
    expect(getByText('Ảnh đại diện')).toBeTruthy();
    expect(getByText('Ảnh hồ sơ game')).toBeTruthy();
    expect(getByText('Ảnh chia sẻ')).toBeTruthy();
    expect(getByText('Hoàn tất hồ sơ')).toBeTruthy();
  });

  it('opens the source picker from the avatar selector', async () => {
    const { getByLabelText, getByText } = await render(<ProfileMediaScreen />);

    fireEvent.press(getByLabelText('Thêm ảnh đại diện.'));

    await waitFor(() => expect(getByText('Chọn từ thư viện')).toBeTruthy());
    expect(getByText('Chụp ảnh mới')).toBeTruthy();
  });
});
