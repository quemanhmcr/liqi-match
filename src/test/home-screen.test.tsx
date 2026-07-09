import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the login screen entry actions', async () => {
    const { getByLabelText, getByText, queryByPlaceholderText, queryByText } =
      await render(<HomeScreen />);

    expect(getByText(/Đăng nhập để/)).toBeTruthy();
    expect(getByText(/vào set đúng vibe/)).toBeTruthy();
    expect(getByText(/Kết nối với cộng đồng Liqi/)).toBeTruthy();
    expect(getByText('Tiếp tục với Google')).toBeTruthy();
    expect(getByText('Tiếp tục với Facebook')).toBeTruthy();
    expect(getByText('Tiếp tục với TikTok')).toBeTruthy();
    expect(getByText('Điều khoản')).toBeTruthy();
    expect(getByText('Quyền riêng tư')).toBeTruthy();
    expect(getByLabelText('Xem thử không cần đăng nhập')).toBeTruthy();
    expect(queryByText('Lấy mã')).toBeNull();
    expect(queryByPlaceholderText('Nhập số điện thoại')).toBeNull();
    expect(queryByPlaceholderText('Nhập mã xác minh')).toBeNull();
  });
});
