import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { createAssetKey, type AssetResolver } from '@/entities/media-asset';
import type { ActivityFeedRepository } from '@/entities/trust-outcomes';
import { TrustActivityItemV2Schema } from '@/shared/contracts/core-v2';
import type { HomeDashboard } from '@/features/home/home-dashboard-service';
import HomeDashboardScreen from '@/features/home/screens/HomeDashboardScreen';
import { renderWithProviders } from '@/test/render-with-providers';

let mockNotificationUnseenCount = 3;

const unavailableAssetResolver: AssetResolver = {
  async invalidate() {},
  async preload() {},
  resolve(key) {
    return {
      fallback: 'avatar-neutral',
      key,
      retryable: true,
      state: 'offline-unavailable',
    };
  },
};

jest.mock('@/entities/notifications', () => {
  const actual = jest.requireActual(
    '@/entities/notifications',
  ) as typeof import('@/entities/notifications');
  return {
    ...actual,
    useNotificationInboxSummary: () => ({
      data: { unseenCount: mockNotificationUnseenCount },
    }),
  };
});

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

const mockExpoRouter = jest.requireMock('expo-router') as {
  router: { push: ReturnType<typeof jest.fn> };
};

async function settleHomeQueries(
  result: Awaited<ReturnType<typeof renderWithProviders>>,
) {
  await waitFor(() => expect(result.queryClient.isFetching()).toBe(0));
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

const syncedDashboard: HomeDashboard = {
  activeMatchCount: 1,
  currentProfile: {
    displayName: 'Synced Player',
    handle: 'Synced Player',
    rankName: 'Cao Thủ',
    readySummary: '1 set đã match',
    roleNames: ['Đi Rừng'],
  },
  matchedSets: [
    {
      actionLabel: 'Vào set',
      createdAt: '2026-07-07T00:00:00Z',
      heroNames: ['Aya', 'Helen', 'Annette', 'Alice'],
      id: 'match-1',
      kind: 'Tri kỉ',
      meta: 'Tối · Có voice',
      name: 'Minh Anh',
      playerId: '20000000-0000-4000-8000-000000000002',
      profileId: 'minh-anh',
      rankName: 'Cao Thủ',
      roleNames: ['Trợ Thủ'],
      status: 'ready',
      subtitle: 'Cao Thủ · Trợ Thủ · Global',
      unreadCount: 1,
    },
  ],
  preview: false,
};

async function renderHomeDashboard(
  getDashboard: () => Promise<HomeDashboard> = async () => syncedDashboard,
  waitForSuccess = true,
  assetResolver?: AssetResolver,
) {
  const result = await renderWithProviders(<HomeDashboardScreen />, {
    serviceOverrides: {
      ...(assetResolver ? { assetResolver } : undefined),
      homeRepository: { getDashboard },
    },
  });
  if (waitForSuccess) {
    await result.findByText(/Chào Synced/);
    await settleHomeQueries(result);
  }
  return result;
}

describe('HomeDashboardScreen', () => {
  beforeEach(() => {
    mockExpoRouter.router.push.mockClear();
    mockNotificationUnseenCount = 3;
  });

  it('renders the reference hero, mode order, room cards and recent activity', async () => {
    const {
      getAllByRole,
      getByLabelText,
      getByTestId,
      getByText,
      queryByText,
    } = await renderHomeDashboard();

    expect(getByTestId('home-notification-unread-dot')).toBeTruthy();
    expect(getByText(/Chào Synced/)).toBeTruthy();
    expect(getByText('Tự động ghép')).toBeTruthy();
    const heroTitle = getByText('Tìm Tri kỉ');
    expect(heroTitle.props.numberOfLines).toBe(1);
    expect(getByTestId('home-ready-hero-icon-heart-outline')).toBeTruthy();
    expect(
      StyleSheet.flatten(getByTestId('home-ready-hero-shell').props.style),
    ).toMatchObject({ height: 272 });
    expect(getByText('Bắt đầu ghép')).toBeTruthy();
    expect(getByText('Phòng của bạn')).toBeTruthy();
    expect(getByText('Buổi chơi sắp tới')).toBeTruthy();
    expect(getByText('Hoạt động gần đây')).toBeTruthy();
    expect(
      getByLabelText('Thành phố LiQi cho tính năng tìm Tri kỉ'),
    ).toBeTruthy();

    expect(getByTestId('home-ready-mode-grid')).toBeTruthy();
    const modeLabels = ['Tri kỉ', 'Love', 'Normal', 'Rank', 'Team'];
    const modeButtons = getAllByRole('button').filter((button) =>
      modeLabels.includes(button.props.accessibilityLabel),
    );
    expect(
      modeButtons.map((button) => button.props.accessibilityLabel),
    ).toEqual(['Tri kỉ', 'Love', 'Normal', 'Rank', 'Team']);
    expect(getByLabelText('Tri kỉ').props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(
      getByTestId('home-ready-mode-icon-soulmate-heart-circle'),
    ).toBeTruthy();
    expect(getByTestId('home-ready-mode-icon-setlove-heart')).toBeTruthy();
    expect(getByTestId('home-ready-mode-icon-normal-happy')).toBeTruthy();
    expect(getByTestId('home-ready-mode-icon-rank-trophy')).toBeTruthy();
    expect(getByTestId('home-ready-mode-icon-team-people')).toBeTruthy();

    const heroBackgroundStyle = StyleSheet.flatten(
      getByTestId('home-ready-hero-background').props.style,
    );
    expect(heroBackgroundStyle).toMatchObject({
      height: '100%',
      width: '100%',
    });
    expect(
      StyleSheet.flatten(getByTestId('home-ready-hero-content').props.style),
    ).toMatchObject({
      height: '100%',
      paddingBottom: 14,
      paddingLeft: 16,
      paddingTop: 17,
      width: '54%',
    });

    expect(getByLabelText('Mở hồ sơ Minh Anh')).toBeTruthy();
    expect(getByLabelText('Mở Phòng của bạn')).toBeTruthy();
    expect(getByLabelText('Tạo phòng từ match')).toBeTruthy();
    expect(getByLabelText('Xem tất cả hoạt động')).toBeTruthy();
    expect(getByLabelText('Chiến thắng, 12/07 · 3 trận')).toBeTruthy();
    expect(getByLabelText('Gánh team, 10/07 · 2 trận')).toBeTruthy();
    expect(getByLabelText('Chuỗi 4 win, 08/07 · 4 trận')).toBeTruthy();
    expect(getByLabelText('Chill cùng nhau, 06/07 · 2 trận')).toBeTruthy();
    expect(queryByText('Xin chào,')).toBeNull();
    expect(queryByText('Những người đã match')).toBeNull();
  });

  it('renders authoritative post-session activity on the real Home screen', async () => {
    const feedbackActivity = TrustActivityItemV2Schema.parse({
      activityItemId: '47000000-0000-4000-8000-000000000030',
      createdAt: '2026-07-14T14:00:00.000Z',
      deduplicationKey: 'feedback:home:integrated',
      dismissedAt: null,
      kind: 'feedback_prompt',
      payload: {
        confirmationDeadlineAt: '2026-07-17T14:00:00.000Z',
        outcomeId: '44000000-0000-4000-8000-000000000030',
        sessionId: '42000000-0000-4000-8000-000000000030',
      },
      playerId: '20000000-0000-4000-8000-000000000001',
      priority: 1000,
      version: 1,
    });
    if (feedbackActivity.kind !== 'feedback_prompt') {
      throw new Error('Expected an authoritative feedback activity.');
    }
    const activityFeedRepository: ActivityFeedRepository = {
      async dismiss() {
        throw new Error('not used');
      },
      async list() {
        return [feedbackActivity];
      },
    };
    const screen = await renderWithProviders(<HomeDashboardScreen />, {
      serviceOverrides: {
        activityFeedRepository,
        homeRepository: { getDashboard: async () => syncedDashboard },
      },
    });

    expect(await screen.findByText('Hoạt động của bạn')).toBeTruthy();
    await settleHomeQueries(screen);
    expect(await screen.findByText('Hoàn tất phản hồi buổi chơi')).toBeTruthy();
    await fireEvent.press(screen.getByText('Phản hồi'));
    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.sessions.feedback(feedbackActivity.payload.sessionId),
    );
  });

  it('opens matched profiles through the canonical PlayerId route', async () => {
    const { getByLabelText } = await renderHomeDashboard();

    await fireEvent.press(getByLabelText('Mở hồ sơ Minh Anh'));

    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.profile.playerDetail('20000000-0000-4000-8000-000000000002'),
    );
  });

  it('uses one authoritative ready action and keeps the selected mode visible', async () => {
    const { getByLabelText, getByText } = await renderHomeDashboard();

    await fireEvent.press(getByLabelText('Bật tìm đội'));

    await waitFor(() => {
      expect(getByLabelText('Tắt tìm đội')).toBeTruthy();
      expect(getByText('Tạm dừng ghép')).toBeTruthy();
      expect(getByText(/Đang tìm kết nối/)).toBeTruthy();
    });

    await fireEvent.press(getByLabelText('Rank'));

    await waitFor(() => {
      expect(getByText('Tìm đồng đội')).toBeTruthy();
      expect(getByLabelText('Rank').props.accessibilityState).toEqual({
        disabled: false,
        selected: true,
      });
    });
  });

  it('hides the unread dot when the account summary is fully seen', async () => {
    mockNotificationUnseenCount = 0;
    const { queryByTestId } = await renderHomeDashboard();

    expect(queryByTestId('home-notification-unread-dot')).toBeNull();
  });

  it('opens notifications from the header bell', async () => {
    const { getByLabelText } = await renderHomeDashboard();

    await fireEvent.press(getByLabelText('Thông báo'));

    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.notifications,
    );
  });

  it('renders the explicit offline avatar state from the injected resolver', async () => {
    const dashboard: HomeDashboard = {
      ...syncedDashboard,
      currentProfile: {
        ...syncedDashboard.currentProfile,
        avatarAssetKey: createAssetKey('asset:profile:test:avatar'),
      },
    };
    const screen = await renderHomeDashboard(
      async () => dashboard,
      true,
      unavailableAssetResolver,
    );

    expect(screen.getByLabelText('Avatar offline-unavailable')).toBeTruthy();
  });

  it('shows a retry action for a retryable repository failure', async () => {
    const result = await renderHomeDashboard(async () => {
      throw Object.assign(new Error('Home API unavailable'), {
        code: 'network_error',
        retryable: true,
      });
    }, false);

    expect(await result.findByText('Không thể tải Trang chủ')).toBeTruthy();
    expect(result.queryByText('Minh Anh')).toBeNull();
    expect(result.getByLabelText('Thử tải lại Trang chủ')).toBeTruthy();
  });

  it('does not offer retry for a non-retryable repository failure', async () => {
    const result = await renderHomeDashboard(async () => {
      throw Object.assign(new Error('Invalid home request'), {
        code: 'validation_failed',
        retryable: false,
      });
    }, false);

    expect(await result.findByText('Không thể tải Trang chủ')).toBeTruthy();
    expect(result.queryByLabelText('Thử tải lại Trang chủ')).toBeNull();
  });

  it('keeps the latest dashboard visible when a refresh fails', async () => {
    const getDashboard = jest
      .fn<() => Promise<HomeDashboard>>()
      .mockResolvedValueOnce(syncedDashboard)
      .mockRejectedValueOnce(
        Object.assign(new Error('Refresh unavailable'), {
          code: 'network_error',
          retryable: true,
        }),
      );
    const result = await renderHomeDashboard(getDashboard);

    await act(async () => {
      await result.queryClient.refetchQueries({
        queryKey: ['home-dashboard'],
      });
    });

    await waitFor(() => {
      expect(
        result.getByText(
          'Không thể làm mới. Đang hiển thị dữ liệu đã tải gần nhất.',
        ),
      ).toBeTruthy();
    });
    expect(result.getByLabelText('Mở hồ sơ Minh Anh')).toBeTruthy();
  });
});
