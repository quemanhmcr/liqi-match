import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import {
  mockNotificationInboxRepository,
  resetMockNotificationInboxForTesting,
} from '@/entities/notifications/data/mock-notification-inbox.repository';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

const notificationTestQueryClients = new Set<QueryClient>();

afterEach(() => {
  for (const queryClient of notificationTestQueryClients) queryClient.clear();
  notificationTestQueryClients.clear();
});

function renderNotificationWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
  notificationTestQueryClients.add(queryClient);

  return renderWithProviders(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

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
      await renderNotificationWithProviders(<NotificationsScreen />);

    expect(await findByText('3 thông báo mới')).toBeTruthy();
    expect(getByText('Thông báo')).toBeTruthy();
    expect(getByText('Minh Anh')).toBeTruthy();
    expect(getByText('“Team Sao Băng”')).toBeTruthy();
    expect(getByText('Khoa Jungle')).toBeTruthy();
    expect(getAllByText('Hệ thống:').length).toBeGreaterThan(0);
    expect(getByText('Đã tải hết thông báo')).toBeTruthy();
    expect(queryByLabelText('Đánh dấu tất cả thông báo là đã đọc')).toBeNull();

    await act(async () => {
      mockFocusEffect?.();
    });

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
      await renderNotificationWithProviders(<NotificationsScreen />);

    expect(await findByText('3 thông báo mới')).toBeTruthy();
    await fireEvent.press(await findByLabelText('Lọc Chưa đọc'));

    expect(getByText('Minh Anh')).toBeTruthy();
    expect(getByText('Khoa Jungle')).toBeTruthy();

    await act(async () => {
      mockFocusEffect?.();
    });

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
