import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the login screen entry actions', async () => {
    const { getByText, queryByPlaceholderText, queryByText } = await render(<HomeScreen />);

    expect(getByText('Liqi')).toBeTruthy();
    expect(getByText('Match')).toBeTruthy();
    expect(getByText('Người thật')).toBeTruthy();
    expect(getByText('Tiếp tục với Google')).toBeTruthy();
    expect(getByText('Facebook')).toBeTruthy();
    expect(getByText('TikTok')).toBeTruthy();
    expect(getByText('Điều khoản sử dụng')).toBeTruthy();
    expect(getByText('Chính sách quyền riêng tư')).toBeTruthy();
    expect(queryByText('Lấy mã')).toBeNull();
    expect(queryByPlaceholderText('Nhập số điện thoại')).toBeNull();
    expect(queryByPlaceholderText('Nhập mã xác minh')).toBeNull();
  });
});
