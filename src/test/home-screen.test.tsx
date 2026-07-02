import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the login screen entry actions', async () => {
    const { getByPlaceholderText, getByText } = await render(<HomeScreen />);

    expect(getByText('Liqi')).toBeTruthy();
    expect(getByText('Match')).toBeTruthy();
    expect(getByText('Đăng nhập')).toBeTruthy();
    expect(getByPlaceholderText('Nhập số điện thoại')).toBeTruthy();
    expect(getByText('Cách đăng nhập khác')).toBeTruthy();
  });
});
