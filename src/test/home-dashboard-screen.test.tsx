import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import HomeDashboardScreen from '@/app/home';

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

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('HomeDashboardScreen', () => {
  it('renders the matched-sets home dashboard shell', async () => {
    const { getAllByText, getByText } = await renderWithQueryClient(
      <HomeDashboardScreen />,
    );

    expect(getByText('Xin chào,')).toBeTruthy();
    expect(getByText('Sẵn sàng vào set?')).toBeTruthy();
    expect(getByText('Đã match thành công')).toBeTruthy();
    expect(getByText('Set LV')).toBeTruthy();
    expect(getAllByText('Tri kỉ').length).toBeGreaterThan(0);
    expect(getAllByText('Rank').length).toBeGreaterThan(0);
    expect(getAllByText('Trang chủ').length).toBeGreaterThan(0);
    expect(getByText('Khám phá')).toBeTruthy();
    expect(getByText('Tin nhắn')).toBeTruthy();
    expect(getByText('Hồ sơ')).toBeTruthy();
    expect(getByText('Minh Anh')).toBeTruthy();
  });
});
