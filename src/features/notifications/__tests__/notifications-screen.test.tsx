import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { appRoutes } from '@/app-shell/navigation/routes';
import { DeepLinkV1Schema } from '@/shared/contracts/core-v1';
import type {
  NotificationInboxRepository,
  NotificationRecord,
} from '@/entities/notifications';
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

async function renderNotificationWithProviders(
  ui: ReactElement,
  notificationRepository: NotificationInboxRepository = mockNotificationInboxRepository,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
  notificationTestQueryClients.add(queryClient);

  const result = await renderWithProviders(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    {
      serviceOverrides: { notificationRepository },
    },
  );
  return { ...result, notificationQueryClient: queryClient };
}

function notificationRepositoryWithList(
  list: NotificationInboxRepository['list'],
): NotificationInboxRepository {
  return {
    getSummary: (input) => mockNotificationInboxRepository.getSummary(input),
    list,
    markRead: (input) => mockNotificationInboxRepository.markRead(input),
    markSeenThrough: (input) =>
      mockNotificationInboxRepository.markSeenThrough(input),
  };
}

type FocusEffect = () => undefined | void | (() => void);
let mockFocusEffect: FocusEffect | undefined;

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    navigate: jest.fn(),
    push: jest.fn(),
  },
  useFocusEffect: (effect: FocusEffect) => {
    mockFocusEffect = effect;
  },
}));

const mockExpoRouter = jest.requireMock('expo-router') as {
  router: {
    back: ReturnType<typeof jest.fn>;
    canGoBack: ReturnType<typeof jest.fn>;
    navigate: ReturnType<typeof jest.fn>;
    push: ReturnType<typeof jest.fn>;
  };
};

describe('NotificationsScreen', () => {
  beforeEach(async () => {
    mockFocusEffect = undefined;
    mockExpoRouter.router.back.mockClear();
    mockExpoRouter.router.canGoBack.mockReset();
    mockExpoRouter.router.canGoBack.mockReturnValue(false);
    mockExpoRouter.router.navigate.mockClear();
    mockExpoRouter.router.push.mockClear();
    await resetMockNotificationInboxForTesting(testAuthSession.user.id);
  });

  it('renders the canonical inbox and marks exposure seen only after focus', async () => {
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
    );

    expect(await screen.findByText('Minh Anh')).toBeTruthy();
    expect(screen.getByTestId('app-screen-scroll')).toBeTruthy();
    expect(screen.getByTestId('notifications-identity-header')).toBeTruthy();
    expect(screen.getByText('Thông báo')).toBeTruthy();
    expect(screen.getByText('Những cập nhật quan trọng từ LiQi')).toBeTruthy();
    expect(screen.getByLabelText('Quay lại')).toBeTruthy();
    expect(screen.getByLabelText('Lọc Tất cả')).toBeTruthy();
    expect(screen.getByLabelText('Lọc Chưa đọc')).toBeTruthy();
    expect(screen.getByLabelText('Lọc Tin nhắn')).toBeTruthy();
    expect(screen.getByLabelText('Lọc Hoạt động')).toBeTruthy();
    expect(screen.getByLabelText('Lọc Hệ thống')).toBeTruthy();
    expect(screen.getByText('“Team Sao Băng”')).toBeTruthy();
    expect(screen.getByText('Khoa Jungle')).toBeTruthy();
    expect(screen.getAllByText('Hệ thống:').length).toBeGreaterThan(0);
    expect(screen.getByText('Đã tải hết thông báo')).toBeTruthy();
    expect(
      screen.queryByLabelText('Đánh dấu tất cả thông báo là đã đọc'),
    ).toBeNull();
    expect(screen.queryByText('3 thông báo mới')).toBeNull();
    expect(
      screen.getByTestId('notification-attention-invite-team-sao-bang'),
    ).toBeTruthy();

    await act(async () => {
      mockFocusEffect?.();
    });

    await waitFor(async () => {
      const summary = await mockNotificationInboxRepository.getSummary({
        session: testAuthSession,
      });
      expect(summary.unseenCount).toBe(0);
    });
    expect(screen.getByText('Minh Anh')).toBeTruthy();
    expect(screen.getByText('Khoa Jungle')).toBeTruthy();
    await screen.unmount();
  });

  it('owns back navigation through the canonical header action', async () => {
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
    );

    expect(await screen.findByText('Minh Anh')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockExpoRouter.router.navigate).toHaveBeenCalledWith(
      appRoutes.main.home,
    );

    mockExpoRouter.router.canGoBack.mockReturnValue(true);
    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockExpoRouter.router.back).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('keeps exposed items unread until the user opens their destination', async () => {
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
    );

    expect(await screen.findByText('Minh Anh')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Lọc Chưa đọc'));

    expect(screen.getByText('Minh Anh')).toBeTruthy();
    expect(screen.getByText('Khoa Jungle')).toBeTruthy();

    await act(async () => {
      mockFocusEffect?.();
    });

    await waitFor(async () => {
      const summary = await mockNotificationInboxRepository.getSummary({
        session: testAuthSession,
      });
      expect(summary.unseenCount).toBe(0);
    });
    expect(screen.getByText('Minh Anh')).toBeTruthy();
    expect(screen.getByText('Khoa Jungle')).toBeTruthy();
    expect(screen.queryByText('Bạn đã xem hết')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Trả lời Khoa Jungle'));

    await waitFor(() => {
      expect(screen.queryByText('Khoa Jungle')).toBeNull();
    });
    expect(screen.getByText('Minh Anh')).toBeTruthy();
    await waitFor(async () => {
      const page = await mockNotificationInboxRepository.list({
        limit: 50,
        session: testAuthSession,
      });
      expect(
        page.items.find((item) => item.id === 'message-khoa-jungle')?.readAt,
      ).not.toBeNull();
    });
    await screen.unmount();
  });

  it('offers retry for a retryable notification failure', async () => {
    const repository = notificationRepositoryWithList(async () => {
      throw Object.assign(new Error('Notification network failure'), {
        code: 'network_error',
        retryable: true,
      });
    });
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
      repository,
    );

    expect(await screen.findByText('Không tải được thông báo')).toBeTruthy();
    expect(screen.getByLabelText('Thử lại')).toBeTruthy();
  });

  it('does not offer retry for a non-retryable notification failure', async () => {
    const repository = notificationRepositoryWithList(async () => {
      throw Object.assign(new Error('Invalid notification request'), {
        code: 'validation_failed',
        retryable: false,
      });
    });
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
      repository,
    );

    expect(await screen.findByText('Không tải được thông báo')).toBeTruthy();
    expect(screen.queryByLabelText('Thử lại')).toBeNull();
  });

  it('keeps the latest notification feed visible when refresh fails', async () => {
    const originalList = mockNotificationInboxRepository.list.bind(
      mockNotificationInboxRepository,
    );
    const list = jest
      .fn<NotificationInboxRepository['list']>()
      .mockImplementationOnce(originalList)
      .mockRejectedValueOnce(
        Object.assign(new Error('Notification refresh failure'), {
          code: 'network_error',
          retryable: true,
        }),
      );
    const repository = notificationRepositoryWithList(list);
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
      repository,
    );
    expect(await screen.findByText('Minh Anh')).toBeTruthy();

    await act(async () => {
      await screen.notificationQueryClient.refetchQueries({
        queryKey: ['notification-inbox', 'feed'],
      });
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText('Thông báo đang hiển thị dữ liệu cũ'),
      ).toBeTruthy();
    });
    expect(screen.getByText('Minh Anh')).toBeTruthy();
  });

  it('opens a friendship request on the canonical PlayerId profile route', async () => {
    const requesterPlayerId = '20000000-0000-4000-8000-000000001311';
    const notification = {
      id: '90000000-0000-4000-8000-000000001311',
      kind: 'friendship-requested' as const,
      occurredAt: '2026-07-14T13:11:00.000Z',
      payload: { requesterPlayerId },
      readAt: null,
      recipientId: '20000000-0000-4000-8000-000000000001',
      seenAt: null,
    };
    const repository: NotificationInboxRepository = {
      getSummary: async () => ({
        latestWatermark: null,
        unseenCount: 1,
        updatedAt: '2026-07-14T13:11:00.000Z',
      }),
      list: async () => ({
        items: [notification],
        latestWatermark: {
          id: notification.id,
          occurredAt: notification.occurredAt,
        },
        nextCursor: null,
        unseenCount: 1,
      }),
      markRead: async () => ({
        notification: { ...notification, readAt: '2026-07-14T13:12:00.000Z' },
        unseenCount: 0,
      }),
      markSeenThrough: async ({ seenThrough }) => ({
        seenAt: '2026-07-14T13:12:00.000Z',
        seenThrough,
        unseenCount: 0,
      }),
    };
    const screen = await renderNotificationWithProviders(
      <NotificationsScreen />,
      repository,
    );

    await fireEvent.press(
      await screen.findByLabelText('Xem lời mời Lời mời kết bạn'),
    );

    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.profile.playerDetail(requesterPlayerId),
    );
    await screen.unmount();
  });

  it('opens the canonical set target from a set invite', async () => {
    const screen = await renderWithProviders(<NotificationsScreen />);
    const page = await screen.services.notificationRepository.list({
      limit: 50,
      session: testAuthSession,
    });
    const invite = page.items.find(
      (notification) => notification.kind === 'set-invite',
    );
    if (invite?.kind !== 'set-invite') {
      throw new Error('Expected a canonical set-invite notification.');
    }

    await fireEvent.press(
      await screen.findByLabelText(
        `Xem set ${invite.payload.actor.displayName}`,
      ),
    );

    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.discover.setDetail(invite.payload.setId),
    );
    await screen.unmount();
  });

  it.each([
    {
      deepLink: {
        sessionId: '42000000-0000-4000-8000-000000000001',
        target: 'session_feedback' as const,
      },
      expectedRoute: appRoutes.sessions.feedback(
        '42000000-0000-4000-8000-000000000001',
      ),
      id: '90000000-0000-4000-8000-000000000101',
      label: 'feedback',
    },
    {
      deepLink: { target: 'home' as const },
      expectedRoute: appRoutes.main.home,
      id: '90000000-0000-4000-8000-000000000102',
      label: 'repeat-play Home',
    },
  ])(
    'opens the canonical $label system destination from the inbox',
    async (fixture) => {
      const notification: NotificationRecord = {
        id: fixture.id,
        kind: 'system',
        occurredAt: '2026-07-14T14:00:00.000Z',
        payload: { deepLink: DeepLinkV1Schema.parse(fixture.deepLink) },
        readAt: null,
        recipientId: testAuthSession.user.id,
        seenAt: null,
      };
      const repository: NotificationInboxRepository = {
        async getSummary() {
          return {
            latestWatermark: {
              id: notification.id,
              occurredAt: notification.occurredAt,
            },
            unseenCount: 1,
            updatedAt: notification.occurredAt,
          };
        },
        async list() {
          return {
            items: [notification],
            latestWatermark: {
              id: notification.id,
              occurredAt: notification.occurredAt,
            },
            nextCursor: null,
            unseenCount: 1,
          };
        },
        async markRead() {
          return {
            notification: {
              ...notification,
              readAt: notification.occurredAt,
              seenAt: notification.occurredAt,
            },
            unseenCount: 0,
          };
        },
        async markSeenThrough(input) {
          return {
            seenAt: notification.occurredAt,
            seenThrough: input.seenThrough,
            unseenCount: 0,
          };
        },
      };
      const screen = await renderNotificationWithProviders(
        <NotificationsScreen />,
        repository,
      );

      await fireEvent.press(await screen.findByLabelText('Mở Hệ thống:'));

      expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
        fixture.expectedRoute,
      );
      await screen.unmount();
    },
  );

  it('opens the canonical conversation and preserves it after marking the notification read', async () => {
    const screen = await renderWithProviders(<NotificationsScreen />);
    const services = screen.services;
    const page = await services.notificationRepository.list({
      limit: 50,
      session: testAuthSession,
    });
    const directMessage = page.items.find(
      (notification) => notification.kind === 'direct-message',
    );
    if (directMessage?.kind !== 'direct-message') {
      throw new Error('Expected a canonical direct-message notification.');
    }

    const messageContext = {
      locale: 'vi',
      timezone: 'Asia/Bangkok',
      viewerId: testAuthSession.user.id,
    };
    const conversationBefore = await services.messageRepository.getConversation(
      directMessage.payload.conversationId,
      messageContext,
    );
    if (!conversationBefore) {
      throw new Error('Expected the notification conversation to exist.');
    }
    const senderBefore = conversationBefore.data.members.find(
      (member) => member.id === directMessage.payload.actor.id,
    );

    expect(senderBefore).toMatchObject({
      displayName: directMessage.payload.actor.displayName,
      id: directMessage.payload.actor.id,
    });
    if (directMessage.payload.actor.avatarAssetKey) {
      expect(senderBefore?.avatar).toMatchObject({
        assetKey: directMessage.payload.actor.avatarAssetKey,
        kind: 'fixture',
      });
    }

    const replyButton = await screen.findByLabelText(
      `Trả lời ${directMessage.payload.actor.displayName}`,
    );
    await act(async () => {
      await fireEvent.press(replyButton);
    });

    await waitFor(() => {
      expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
        appRoutes.messages.detail(directMessage.payload.conversationId),
      );
    });

    await waitFor(async () => {
      const refreshedPage = await services.notificationRepository.list({
        limit: 50,
        session: testAuthSession,
      });
      const refreshedNotification = refreshedPage.items.find(
        (notification) => notification.id === directMessage.id,
      );
      expect(refreshedNotification?.readAt).not.toBeNull();
    });

    const conversationAfter = await services.messageRepository.getConversation(
      directMessage.payload.conversationId,
      messageContext,
    );
    expect(conversationAfter?.data).toEqual(conversationBefore.data);
    await screen.unmount();
  });
});
