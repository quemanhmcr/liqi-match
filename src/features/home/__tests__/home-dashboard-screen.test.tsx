import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

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
        heroNames: ['Aya', 'Helen', 'Annette', 'Alice'],
        id: 'match-1',
        kind: 'Tri kỉ',
        meta: 'Tối · Có voice',
        name: 'Minh Anh',
        profileId: 'minh-anh',
        rankName: 'Cao Thủ',
        roleNames: ['Trợ Thủ'],
        status: 'ready',
        subtitle: 'Cao Thủ · Trợ Thủ · Global',
        unreadCount: 1,
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
        heroNames: ['Aya', 'Helen', 'Annette', 'Alice'],
        id: 'match-1',
        kind: 'Tri kỉ',
        meta: 'Tối · Có voice',
        name: 'Minh Anh',
        profileId: 'minh-anh',
        rankName: 'Cao Thủ',
        roleNames: ['Trợ Thủ'],
        status: 'ready',
        subtitle: 'Cao Thủ · Trợ Thủ · Global',
        unreadCount: 1,
      },
    ],
    preview: false,
  })),
  homeReadyModes: [
    {
      accent: '#C679FF',
      description: 'Ưu tiên kết nối tình cảm, tìm người hợp vibe.',
      id: 'setlove',
      label: 'Set Love',
    },
    {
      accent: '#FF7AD9',
      description: 'Tìm đồng đội thân thiết, đồng hành lâu dài.',
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

  it('renders a compact decision-first dashboard with explicit semantics', async () => {
    const {
      getAllByText,
      getByLabelText,
      getByTestId,
      getByText,
      queryByText,
    } = await renderWithProviders(<HomeDashboardScreen />);

    expect(getByTestId('home-notification-unread-dot')).toBeTruthy();
    expect(getByText('Xin chào,')).toBeTruthy();
    expect(getByText('1 match mới')).toBeTruthy();
    expect(getByText('Sẵn sàng vào set?')).toBeTruthy();
    expect(getByText('Chưa sẵn sàng')).toBeTruthy();
    expect(getByText('Mood · Set Love')).toBeTruthy();
    expect(getByText('Những người đã match')).toBeTruthy();
    expect(getAllByText('Tri kỉ').length).toBeGreaterThan(0);
    expect(getByText('Thường')).toBeTruthy();
    expect(getByText('Xếp hạng')).toBeTruthy();
    expect(getByTestId('home-ready-mode-grid')).toBeTruthy();
    expect(
      getByTestId('home-ready-mode-icon-setlove-heart-outline'),
    ).toBeTruthy();
    expect(
      getByTestId('home-ready-mode-icon-soulmate-handshake-outline'),
    ).toBeTruthy();
    expect(
      getByTestId('home-match-kind-icon-Tri kỉ-handshake-outline'),
    ).toBeTruthy();
    const heroBackgroundImage = getByTestId('home-ready-hero-background');
    expect(heroBackgroundImage.props.resizeMode).toBe('cover');
    const heroBackgroundStyle = StyleSheet.flatten(
      heroBackgroundImage.props.style,
    );
    expect(heroBackgroundStyle).toMatchObject({
      height: '100%',
      left: 0,
      opacity: 0.72,
      position: 'absolute',
      top: 0,
      transform: [{ scale: 1.18 }, { translateX: -18 }],
      width: '100%',
    });
    expect(heroBackgroundStyle.bottom).toBeUndefined();
    expect(heroBackgroundStyle.right).toBeUndefined();
    expect(
      StyleSheet.flatten(getByTestId('home-ready-hero-content').props.style),
    ).toMatchObject({
      minHeight: 166,
      padding: 12,
      position: 'relative',
    });
    expect(queryByText('Đội xếp hạng')).toBeNull();
    expect(getAllByText('Minh Anh').length).toBeGreaterThan(0);
    expect(getByText('+1')).toBeTruthy();
    expect(getByLabelText('Nhắn tin với Minh Anh, 1 tin mới')).toBeTruthy();
    expect(getByText('Tối · Có voice').props).toMatchObject({
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.86,
      numberOfLines: 1,
    });
    expect(queryByText('Idle')).toBeNull();
    expect(queryByText('Normal')).toBeNull();
    expect(queryByText('Đã match thành công')).toBeNull();
  });

  it('uses one explicit ready action and keeps the selected mood visible', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(
      <HomeDashboardScreen />,
    );

    fireEvent.press(getByLabelText('Bật sẵn sàng'));

    await waitFor(() => {
      expect(getByLabelText('Tắt sẵn sàng')).toBeTruthy();
      expect(getByText('Đang sẵn sàng')).toBeTruthy();
      expect(getByText('Đang bật · Set Love')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('Xếp hạng'));

    await waitFor(() => {
      expect(getByText('Đang bật · Xếp hạng')).toBeTruthy();
      expect(getByLabelText('Xếp hạng').props.accessibilityState).toEqual({
        selected: true,
      });
    });
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
