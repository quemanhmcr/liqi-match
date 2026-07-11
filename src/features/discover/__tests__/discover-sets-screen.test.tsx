import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { resetDiscoverState, useDiscoverStore } from '../model/discover-store';
import { resetMockDiscoverData } from '../services/discover-service';
import { renderDiscoverScreen } from './discover-test-utils';
import { DiscoverSetsScreen } from '../screens/DiscoverSetsScreen';

jest.setTimeout(15_000);

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

jest.mock('expo-status-bar', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    StatusBar: ({ style }: { style?: string }) =>
      React.createElement(View, { testID: `discover-status-bar-${style}` }),
  };
});

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
}));

const mockExpoRouter = jest.requireMock('expo-router') as {
  router: {
    back: ReturnType<typeof jest.fn>;
    push: ReturnType<typeof jest.fn>;
  };
};

const createSafeAreaMetrics = (width: number) => ({
  frame: { height: 844, width, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
});

const setWindowMetrics = (width: number, fontScale = 1) => {
  const metrics = { fontScale, height: 844, scale: 1, width };
  Dimensions.set({ screen: metrics, window: metrics });
};

beforeEach(() => {
  resetDiscoverState();
  resetMockDiscoverData();
  mockExpoRouter.router.back.mockClear();
  mockExpoRouter.router.push.mockClear();
});

afterEach(() => setWindowMetrics(390));

describe('DiscoverSetsScreen', () => {
  it('renders a standalone full-list page and returns to Explore', async () => {
    const { getByLabelText, getByTestId, getByText, queryByText } =
      await renderDiscoverScreen(
        <DiscoverSetsScreen />,
        createSafeAreaMetrics(390),
      );

    expect(getByTestId('discover-status-bar-light')).toBeTruthy();
    expect(getByLabelText('Tìm kiếm set').props.placeholderTextColor).toBe(
      'rgba(203,213,242,0.58)',
    );
    expect(
      StyleSheet.flatten(getByTestId('discover-sets-sort-toggle').props.style),
    ).toMatchObject({ maxWidth: 136, minHeight: 30 });
    expect(getByText('Set đang cần người')).toBeTruthy();
    expect(getByText('4 set phù hợp')).toBeTruthy();
    expect(getByTestId('discover-set-card-team-sao-bang')).toBeTruthy();
    expect(getByTestId('discover-set-card-duo-jungle-support')).toBeTruthy();
    expect(getByTestId('discover-set-card-leo-rank-5v5')).toBeTruthy();
    expect(getByTestId('discover-set-card-team-late-night')).toBeTruthy();
    expect(queryByText('Tin nhắn')).toBeNull();

    fireEvent.press(getByLabelText('Mở chi tiết Team Sao Băng'));
    await waitFor(() => {
      expect(useDiscoverStore.getState().selectedSetId).toBe('team-sao-bang');
    });

    fireEvent.press(getByLabelText('Xem set Team Sao Băng'));
    await waitFor(() => {
      expect(getByLabelText('Xem set Team Sao Băng')).toBeTruthy();
      expect(queryByText('Đang xem')).toBeNull();
    });

    fireEvent.press(getByLabelText('Quay lại Khám phá'));
    expect(mockExpoRouter.router.back).toHaveBeenCalledTimes(1);
  });

  it('keeps quick filters visible without a redundant header control', async () => {
    const { getByLabelText, getByTestId, getByText, queryByTestId } =
      await renderDiscoverScreen(
        <DiscoverSetsScreen />,
        createSafeAreaMetrics(390),
      );

    expect(getByTestId('discover-sets-filter-row')).toBeTruthy();
    expect(queryByTestId('discover-sets-filter-toggle')).toBeNull();

    fireEvent.press(getByLabelText('Lọc Set theo Team Rank'));
    await waitFor(() => {
      expect(
        getByLabelText('Lọc Set theo Team Rank').props.accessibilityState,
      ).toMatchObject({ selected: true });
      expect(getByText('2 set phù hợp')).toBeTruthy();
      expect(getByTestId('discover-sets-filter-row')).toBeTruthy();
    });
  });

  it('ignores inherited filters that do not apply to Sets', async () => {
    useDiscoverStore.getState().toggleFilter('soulmate');

    const { getByLabelText, getByText } = await renderDiscoverScreen(
      <DiscoverSetsScreen />,
      createSafeAreaMetrics(390),
    );

    expect(getByText('4 set phù hợp')).toBeTruthy();
    expect(
      getByLabelText('Lọc Set theo Tất cả').props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('inherits applicable criteria but keeps child edits out of the parent store', async () => {
    const parentState = useDiscoverStore.getState();
    parentState.setQuery('rank');
    parentState.toggleFilter('mic');

    const { getByLabelText } = await renderDiscoverScreen(
      <DiscoverSetsScreen />,
      createSafeAreaMetrics(390),
    );

    expect(getByLabelText('Tìm kiếm set').props.value).toBe('rank');
    expect(
      getByLabelText('Lọc Set theo Mic on').props.accessibilityState,
    ).toMatchObject({ selected: true });

    fireEvent.changeText(getByLabelText('Tìm kiếm set'), 'tro thu');
    await waitFor(() => {
      expect(getByLabelText('Tìm kiếm set').props.value).toBe('tro thu');
    });

    fireEvent.press(getByLabelText('Lọc Set theo Team Rank'));
    await waitFor(() => {
      expect(
        getByLabelText('Lọc Set theo Team Rank').props.accessibilityState,
      ).toMatchObject({ selected: true });
    });

    expect(useDiscoverStore.getState().query).toBe('rank');
    expect(useDiscoverStore.getState().activeFilterIds).toEqual(['mic']);
  });

  it('searches locally, changes sort mode and keeps request actions idempotent', async () => {
    const { getByLabelText, getByTestId, getByText, queryByText } =
      await renderDiscoverScreen(
        <DiscoverSetsScreen />,
        createSafeAreaMetrics(390),
      );

    fireEvent.changeText(getByLabelText('Tìm kiếm set'), 'tro thu');
    await waitFor(() => {
      expect(getByText('Duo Rừng + Trợ Thủ')).toBeTruthy();
      expect(getByText('Leo rank 5v5')).toBeTruthy();
      expect(queryByText('Team Sao Băng')).toBeNull();
      expect(queryByText('Team late night')).toBeNull();
    });

    fireEvent.press(getByLabelText('Xóa tìm kiếm set'));
    await waitFor(() => {
      expect(getByTestId('discover-set-card-team-sao-bang')).toBeTruthy();
    });

    fireEvent.press(getByTestId('discover-sets-sort-toggle'));
    await waitFor(() => {
      expect(getByLabelText('Sắp xếp theo Mới mở')).toBeTruthy();
    });
    fireEvent.press(getByLabelText('Sắp xếp theo Mới mở'));
    await waitFor(() => {
      expect(getByText('Mới mở')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Xin vào Leo rank 5v5'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => {
      expect(getByText('Đã gửi')).toBeTruthy();
    });
    expect(
      getByLabelText('Xin vào Leo rank 5v5').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it.each([360, 375, 414])(
    'keeps two-tier Set cards readable at %idp',
    async (width) => {
      setWindowMetrics(width, 1.15);
      const { getByTestId, getByText } = await renderDiscoverScreen(
        <DiscoverSetsScreen />,
        createSafeAreaMetrics(width),
      );

      expect(getByTestId('discover-sets-list')).toBeTruthy();
      expect(
        getByTestId('discover-set-list-layout-team-sao-bang'),
      ).toBeTruthy();
      expect(
        getByTestId('discover-set-list-footer-team-sao-bang'),
      ).toBeTruthy();
      expect(
        getByTestId('discover-set-list-layout-duo-jungle-support'),
      ).toBeTruthy();
      expect(getByTestId('discover-set-list-layout-leo-rank-5v5')).toBeTruthy();
      expect(
        getByTestId('discover-set-list-layout-team-late-night'),
      ).toBeTruthy();
      expect(getByText('Duo Rừng + Trợ Thủ').props.numberOfLines).toBe(2);

      const teamTags = within(
        getByTestId('discover-set-list-tags-team-sao-bang'),
      );
      expect(teamTags.getByText('Liliana')).toBeTruthy();
      expect(teamTags.getByText('Yue')).toBeTruthy();
      expect(teamTags.queryByText('Lorion')).toBeNull();
      expect(teamTags.getByText('+2 khác')).toBeTruthy();
      expect(teamTags.getByLabelText('2 thẻ khác')).toBeTruthy();

      const teamFooterNode = getByTestId(
        'discover-set-list-footer-team-sao-bang',
      );
      expect(StyleSheet.flatten(teamFooterNode.props.style)).toMatchObject({
        marginTop: 6,
        minHeight: 31,
      });
      const teamFooter = within(teamFooterNode);
      expect(teamFooter.getByText('+1')).toBeTruthy();
    },
  );
});
