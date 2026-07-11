import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import HomeDashboardScreen from '@/features/home/screens/HomeDashboardScreen';
import { renderWithProviders } from '@/test/render-with-providers';

let mockNotificationUnseenCount = 3;

jest.mock('@/entities/notifications', () => ({
  useNotificationInboxSummary: () => ({
    data: { unseenCount: mockNotificationUnseenCount },
  }),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

const mockExpoRouter = jest.requireMock('expo-router') as {
  router: { push: ReturnType<typeof jest.fn> };
};

jest.mock('@/features/home/home-dashboard-service', () => ({
  buildPreviewHomeDashboard: () => ({
    activeMatchCount: 1,
    currentProfile: {
      displayName: 'Test Player',
      handle: 'Test Player',
      rankName: 'Cao Thủ',
      readySummary: '1 set đã match',
      roleNames: ['Đi Rừng'],
    },
    matchedSets: [
      {
        actionLabel: 'Vào set',
        createdAt: '2026-07-07T00:00:00Z',
        heroNames: ['Aya', 'Helen'],
        id: 'match-1',
        kind: 'Tri kỉ',
        meta: 'Tối · Voice khi cần',
        name: 'Minh Anh',
        rankName: 'Cao Thủ',
        roleNames: ['Trợ Thủ'],
        status: 'ready',
        statusLabel: 'Sẵn sàng',
        subtitle: 'Cao Thủ · Trợ Thủ · Global',
      },
    ],
    preview: false,
  }),
  fetchHomeDashboard: jest.fn(async () => ({
    activeMatchCount: 1,
    currentProfile: {
      displayName: 'Test Player',
      handle: 'Test Player',
      rankName: 'Cao Thủ',
      readySummary: '1 set đã match',
      roleNames: ['Đi Rừng'],
    },
    matchedSets: [
      {
        actionLabel: 'Vào set',
        createdAt: '2026-07-07T00:00:00Z',
        heroNames: ['Aya', 'Helen'],
        id: 'match-1',
        kind: 'Tri kỉ',
        meta: 'Tối · Voice khi cần',
        name: 'Minh Anh',
        rankName: 'Cao Thủ',
        roleNames: ['Trợ Thủ'],
        status: 'ready',
        statusLabel: 'Sẵn sàng',
        subtitle: 'Cao Thủ · Trợ Thủ · Global',
      },
    ],
    preview: false,
  })),
  homeReadyModes: [
    {
      accent: '#C679FF',
      description: 'Vào set nhanh với người đã match.',
      id: 'setlv',
      label: 'Set LV',
    },
    {
      accent: '#FF7AD9',
      description: 'Ưu tiên match chơi lâu dài, thân thiết.',
      id: 'soulmate',
      label: 'Tri kỉ',
    },
    {
      accent: '#64E6FF',
      description: 'Chơi vui, không áp lực rank.',
      id: 'normal',
      label: 'Normal',
    },
    {
      accent: '#5DFFB3',
      description: 'Bật mood leo rank nghiêm túc.',
      id: 'rank',
      label: 'Rank',
    },
    {
      accent: '#FFB86B',
      description: 'Lập hoặc join team rank đang thiếu vai trò.',
      id: 'team',
      label: 'Team Rank',
    },
  ],
}));

describe('HomeDashboardScreen', () => {
  beforeEach(() => {
    mockExpoRouter.router.push.mockClear();
    mockNotificationUnseenCount = 3;
  });

  it('renders the dashboard shell with the account unread indicator', async () => {
    const { getAllByText, getByTestId, getByText } = await renderWithProviders(
      <HomeDashboardScreen />,
    );

    expect(getByTestId('home-notification-unread-dot')).toBeTruthy();
    expect(getByText('Xin chào,')).toBeTruthy();
    expect(getByText('Sẵn sàng vào set?')).toBeTruthy();
    expect(getByText('Đã match thành công')).toBeTruthy();
    expect(getByText('Set LV')).toBeTruthy();
    expect(getAllByText('Tri kỉ').length).toBeGreaterThan(0);
    expect(getAllByText('Rank').length).toBeGreaterThan(0);
    expect(getAllByText('Minh Anh').length).toBeGreaterThan(0);
  });

  it('hides the unread dot when the account summary is fully seen', async () => {
    mockNotificationUnseenCount = 0;
    const { queryByTestId } = await renderWithProviders(
      <HomeDashboardScreen />,
    );

    expect(queryByTestId('home-notification-unread-dot')).toBeNull();
  });

  it('opens notifications from the header bell', async () => {
    const { getByLabelText } = await renderWithProviders(
      <HomeDashboardScreen />,
    );

    fireEvent.press(getByLabelText('Thông báo'));

    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.notifications,
    );
  });
});
