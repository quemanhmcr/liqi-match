import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  mockNotificationInboxRepository,
  resetMockNotificationInboxForTesting,
} from '@/entities/notifications/data/mock-notification-inbox.repository';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

type FocusEffect = () => undefined | void | (() => void);
let mockFocusEffect: FocusEffect | undefined;

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    navigate: jest.fn(),
  },
  useFocusEffect: (effect: FocusEffect) => {
    mockFocusEffect = effect;
  },
}));

describe('NotificationsScreen', () => {
  beforeEach(async () => {
    mockFocusEffect = undefined;
    await resetMockNotificationInboxForTesting(testAuthSession.user.id);
  });

  it('maps the production-shaped mock and marks it seen only after focus', async () => {
    const { findByText, getAllByText, getByText, queryByLabelText, unmount } =
      await renderWithProviders(<NotificationsScreen />);

    expect(await findByText('3 thông báo mới')).toBeTruthy();
    expect(getByText('Thông báo')).toBeTruthy();
    expect(getByText('Minh Anh')).toBeTruthy();
    expect(getByText('“Team Sao Băng”')).toBeTruthy();
    expect(getByText('Khoa Jungle')).toBeTruthy();
    expect(getAllByText('Hệ thống:').length).toBeGreaterThan(0);
    expect(getByText('Đã tải hết thông báo')).toBeTruthy();
    expect(queryByLabelText('Đánh dấu tất cả thông báo là đã đọc')).toBeNull();

    mockFocusEffect?.();

    await waitFor(() => {
      expect(getByText('Không còn thông báo mới')).toBeTruthy();
    });
    await waitFor(async () => {
      const summary = await mockNotificationInboxRepository.getSummary({
        session: testAuthSession,
      });
      expect(summary.unseenCount).toBe(0);
    });
    await unmount();
  });

  it('empties the unread filter when the focused inbox becomes seen', async () => {
    const { findByLabelText, findByText, getByText, unmount } =
      await renderWithProviders(<NotificationsScreen />);

    expect(await findByText('3 thông báo mới')).toBeTruthy();
    fireEvent.press(await findByLabelText('Lọc Chưa đọc'));

    expect(getByText('Minh Anh')).toBeTruthy();
    expect(getByText('Khoa Jungle')).toBeTruthy();

    mockFocusEffect?.();

    await waitFor(() => {
      expect(getByText('Không có thông báo trong mục này')).toBeTruthy();
    });
    await waitFor(async () => {
      const summary = await mockNotificationInboxRepository.getSummary({
        session: testAuthSession,
      });
      expect(summary.unseenCount).toBe(0);
    });
    await unmount();
  });
});
