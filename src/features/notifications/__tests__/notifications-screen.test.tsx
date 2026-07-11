import { describe, expect, it } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import { renderWithProviders } from '@/test/render-with-providers';

describe('NotificationsScreen', () => {
  it('renders the premium notification inbox mock', async () => {
    const { getAllByText, getByText } = await renderWithProviders(
      <NotificationsScreen />,
    );

    expect(getByText('Thông báo')).toBeTruthy();
    expect(getByText('3 thông báo mới')).toBeTruthy();
    expect(getByText('Minh Anh')).toBeTruthy();
    expect(getByText('“Team Sao Băng”')).toBeTruthy();
    expect(getByText('Khoa Jungle')).toBeTruthy();
    expect(getAllByText('Hệ thống:').length).toBeGreaterThan(0);
    expect(getByText('Đã tải hết thông báo')).toBeTruthy();
  });

  it('filters unread notifications and can mark them all read', async () => {
    const { getByLabelText, getByText, queryByText } =
      await renderWithProviders(<NotificationsScreen />);

    fireEvent.press(getByLabelText('Lọc Chưa đọc'));

    await waitFor(() => {
      expect(getByText('Minh Anh')).toBeTruthy();
      expect(getByText('Khoa Jungle')).toBeTruthy();
      expect(queryByText('Team Rank')).toBeNull();
    });

    fireEvent.press(getByLabelText('Đánh dấu tất cả thông báo là đã đọc'));

    await waitFor(() => {
      expect(getByText('Không còn thông báo mới')).toBeTruthy();
      expect(getByText('Không có thông báo trong mục này')).toBeTruthy();
    });
  });
});
