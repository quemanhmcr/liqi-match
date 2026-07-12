import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { Dimensions, processColor, StyleSheet } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';

import { discoverVibeCards } from '../data/discover.mock';
import { resetDiscoverState } from '../model/discover-store';
import { resetMockDiscoverData } from '../services/discover-service';
import { renderDiscoverScreen } from './discover-test-utils';
import { ExploreScreen } from '../screens/ExploreScreen';

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

const mockExpoRouter = jest.requireMock('expo-router') as {
  router: { push: ReturnType<typeof jest.fn> };
};

const createSafeAreaMetrics = (width: number) => ({
  frame: { height: 844, width, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
});

const setWindowMetrics = (width: number, fontScale = 1) => {
  const metrics = { fontScale, height: 844, scale: 1, width };
  Dimensions.set({ screen: metrics, window: metrics });
};

const safeAreaMetrics = createSafeAreaMetrics(390);

const expectAbsoluteFillLayer = (style: Record<string, unknown>) => {
  expect(style).toMatchObject({
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  });
  expect(style).not.toHaveProperty('aspectRatio');
  expect(style).not.toHaveProperty('height');
  expect(style).not.toHaveProperty('maxHeight');
  expect(style).not.toHaveProperty('minHeight');
  expect(style).not.toHaveProperty('width');
};

const expectSizedArtworkLayer = (
  style: Record<string, unknown>,
  width: unknown,
) => {
  expect(style).toMatchObject({
    height: 134,
    left: 0,
    position: 'absolute',
    top: 0,
    width,
  });
  expect(style).not.toHaveProperty('aspectRatio');
  expect(style).not.toHaveProperty('bottom');
  expect(style).not.toHaveProperty('maxHeight');
  expect(style).not.toHaveProperty('minHeight');
  expect(style).not.toHaveProperty('right');
  expect(style).not.toHaveProperty('transform');
};

const expectBottomAnchoredContent = (style: Record<string, unknown>) => {
  expect(style).toMatchObject({
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  });
  expect(style).not.toHaveProperty('height');
  expect(style).not.toHaveProperty('top');
};

beforeEach(() => {
  resetDiscoverState();
  resetMockDiscoverData();
  mockExpoRouter.router.push.mockClear();
});

afterEach(() => setWindowMetrics(390));

describe('ExploreScreen', () => {
  it('renders the primary discover sections and mock cards', async () => {
    const { getByLabelText, getByTestId, getByText, queryByLabelText } =
      await renderDiscoverScreen(<ExploreScreen />, safeAreaMetrics);

    expect(getByText('Khám phá')).toBeTruthy();
    expect(getByText('Vibe hot tối nay')).toBeTruthy();
    expect(getByText('Set đang cần người')).toBeTruthy();
    expect(getByText('Hợp vibe với bạn')).toBeTruthy();
    expect(getByText('Leo rank đêm')).toBeTruthy();
    expect(getByText('Team Sao Băng')).toBeTruthy();
    expect(getByText('Minh Anh')).toBeTruthy();

    expect([1, 2]).toContain(getByText('Team Sao Băng').props.numberOfLines);
    expect(getByText('Leo rank').props.numberOfLines).toBe(1);
    expect(getByText('Mời vào').props.numberOfLines).toBe(1);

    for (const card of discoverVibeCards) {
      const vibeCard = getByTestId(`vibe-card-${card.title}`);
      const vibeBackground = getByTestId(`vibe-background-${card.title}`);
      const vibeGradient = getByTestId(`vibe-gradient-${card.title}`);
      const vibeContent = getByTestId(`vibe-content-${card.title}`);
      const cardStyle = StyleSheet.flatten(vibeCard.props.style);
      const backgroundStyle = StyleSheet.flatten(vibeBackground.props.style);
      const gradientStyle = StyleSheet.flatten(vibeGradient.props.style);
      const contentStyle = StyleSheet.flatten(vibeContent.props.style);

      expect(cardStyle.height).toBe(134);
      expect(cardStyle.overflow).toBe('hidden');
      expect(cardStyle.position).toBe('relative');
      expect(vibeBackground.parent).toBe(vibeCard);
      expect(vibeGradient.parent).toBe(vibeCard);
      expect(vibeContent.parent).toBe(vibeCard);
      expectSizedArtworkLayer(backgroundStyle, cardStyle.width);
      expectAbsoluteFillLayer(gradientStyle);
      expectBottomAnchoredContent(contentStyle);
      expect(vibeBackground.props.resizeMode).toBe('cover');
      expect(vibeBackground.props.source).toBe(card.background);
      expect(vibeGradient.props.colors).toEqual(
        [
          'rgba(4,7,16,0.03)',
          'rgba(4,7,16,0.08)',
          'rgba(4,7,16,0.54)',
          'rgba(4,7,16,0.94)',
        ].map(processColor),
      );
      expect(vibeGradient.props.locations).toEqual([0, 0.42, 0.7, 1]);
      expect(within(vibeContent).getByText(card.title)).toBeTruthy();
      expect(within(vibeContent).getByText(card.interestedLabel)).toBeTruthy();
    }

    await fireEvent.press(getByLabelText('Xem tất cả Vibe hot tối nay'));
    await waitFor(() =>
      expect(mockExpoRouter.router.push).toHaveBeenLastCalledWith(
        appRoutes.discover.vibes,
      ),
    );

    await fireEvent.press(getByLabelText('Xem tất cả Set đang cần người'));
    await waitFor(() =>
      expect(mockExpoRouter.router.push).toHaveBeenLastCalledWith(
        appRoutes.discover.sets,
      ),
    );

    await fireEvent.press(getByLabelText('Xem tất cả Hợp vibe với bạn'));
    await waitFor(() =>
      expect(mockExpoRouter.router.push).toHaveBeenLastCalledWith(
        appRoutes.discover.matches,
      ),
    );

    expect(queryByLabelText('Xem tất cả Hot hôm nay')).toBeNull();
  });

  it('uses one filter control and visibly collapses or expands the panel', async () => {
    const {
      getByLabelText,
      getByTestId,
      getByText,
      queryByLabelText,
      queryByTestId,
      queryByText,
    } = await renderDiscoverScreen(<ExploreScreen />, safeAreaMetrics);

    expect(queryByLabelText('Bộ lọc nâng cao')).toBeNull();
    expect(
      getByLabelText('Ẩn bộ lọc Khám phá').props.accessibilityState,
    ).toMatchObject({ expanded: true });
    expect(getByLabelText('Lọc Khám phá theo Rank')).toBeTruthy();
    expect(getByText('7 kết quả')).toBeTruthy();
    expect(queryByTestId('discover-filter-count')).toBeNull();

    await fireEvent.press(getByLabelText('Lọc Khám phá theo Rank'));
    await waitFor(() => {
      expect(getByText('4 kết quả')).toBeTruthy();
      expect(
        within(getByTestId('discover-filter-count')).getByText('1'),
      ).toBeTruthy();
    });

    await fireEvent.press(getByLabelText('Ẩn bộ lọc Khám phá'));
    await waitFor(() => {
      expect(queryByLabelText('Lọc Khám phá theo Rank')).toBeNull();
      expect(queryByText('4 kết quả')).toBeNull();
      expect(
        getByLabelText('Mở bộ lọc Khám phá').props.accessibilityState,
      ).toMatchObject({ expanded: false });
      expect(
        within(getByTestId('discover-filter-count')).getByText('1'),
      ).toBeTruthy();
    });

    await fireEvent.press(getByLabelText('Mở bộ lọc Khám phá'));
    await waitFor(() => {
      expect(getByLabelText('Lọc Khám phá theo Rank')).toBeTruthy();
      expect(getByText('4 kết quả')).toBeTruthy();
      expect(
        getByLabelText('Ẩn bộ lọc Khám phá').props.accessibilityState,
      ).toMatchObject({ expanded: true });
    });
  });

  it('searches by tokens, hides unrelated metrics and supports quick clear', async () => {
    const { getByLabelText, getByText, queryByText } =
      await renderDiscoverScreen(<ExploreScreen />, safeAreaMetrics);

    expect(getByText('Hot hôm nay')).toBeTruthy();
    await fireEvent.changeText(
      getByLabelText('Tìm trong Khám phá'),
      'giua duong',
    );

    await waitFor(() => {
      expect(getByText('Team Sao Băng')).toBeTruthy();
      expect(queryByText('Duo Rừng + Trợ Thủ')).toBeNull();
      expect(queryByText('Minh Anh')).toBeNull();
      expect(queryByText('Hot hôm nay')).toBeNull();
    });

    await fireEvent.press(getByLabelText('Xoá tìm kiếm Khám phá'));
    await waitFor(() => {
      expect(getByText('Duo Rừng + Trợ Thủ')).toBeTruthy();
      expect(getByText('Hot hôm nay')).toBeTruthy();
    });

    await fireEvent.changeText(
      getByLabelText('Tìm trong Khám phá'),
      'khong ton tai',
    );
    await waitFor(() => {
      expect(getByText('Không có kết quả phù hợp')).toBeTruthy();
    });

    await fireEvent.press(getByLabelText('Đặt lại tìm kiếm Khám phá'));
    await waitFor(() => {
      expect(getByText('Duo Rừng + Trợ Thủ')).toBeTruthy();
    });
  });

  it('combines filters with AND semantics and keeps local actions idempotent', async () => {
    const { getByLabelText, getByText, queryByText } =
      await renderDiscoverScreen(<ExploreScreen />, safeAreaMetrics);

    expect(getByText('7 kết quả')).toBeTruthy();

    await fireEvent.press(getByLabelText('Lọc Khám phá theo Rank'));
    await waitFor(() => {
      expect(getByText('4 kết quả')).toBeTruthy();
      expect(
        getByLabelText('Lọc Khám phá theo Rank').props.accessibilityState,
      ).toMatchObject({ selected: true });
    });

    await fireEvent.press(getByLabelText('Lọc Khám phá theo Mic on'));
    await waitFor(() => {
      expect(getByText('3 kết quả')).toBeTruthy();
      expect(getByText('Leo rank đêm')).toBeTruthy();
      expect(getByText('Team Sao Băng')).toBeTruthy();
      expect(queryByText('Khoa Jungle')).toBeNull();
      expect(
        getByLabelText('Lọc Khám phá theo Mic on').props.accessibilityState,
      ).toMatchObject({ selected: true });
    });

    await fireEvent.press(getByLabelText('Lọc Khám phá theo Mic on'));
    await waitFor(() => {
      expect(getByText('4 kết quả')).toBeTruthy();
      expect(
        getByLabelText('Lọc Khám phá theo Mic on').props.accessibilityState,
      ).toMatchObject({ selected: false });
    });

    await fireEvent.press(getByLabelText('Lọc Khám phá theo Không toxic'));
    await waitFor(() => {
      expect(getByText('1 kết quả')).toBeTruthy();
      expect(getByText('Khoa Jungle')).toBeTruthy();
      expect(queryByText('Leo rank đêm')).toBeNull();
      expect(queryByText('Minh Anh')).toBeNull();
    });

    await fireEvent.press(getByLabelText('Lọc Khám phá theo Tất cả'));
    await waitFor(() => {
      expect(getByText('7 kết quả')).toBeTruthy();
      expect(getByLabelText('Xin vào Duo Rừng + Trợ Thủ')).toBeTruthy();
    });
    await fireEvent.press(getByLabelText('Xin vào Duo Rừng + Trợ Thủ'));
    await waitFor(() => {
      expect(getByText('Đã gửi')).toBeTruthy();
    });
    await fireEvent.press(getByLabelText('Mời vào Khoa Jungle'));
    await waitFor(() => {
      expect(getByText('Đã mời')).toBeTruthy();
    });
  });

  it('selects a vibe and opens the messages tab from a profile', async () => {
    const { getByLabelText } = await renderDiscoverScreen(
      <ExploreScreen />,
      safeAreaMetrics,
    );

    const vibe = getByLabelText('Chọn vibe Leo rank đêm');
    await fireEvent.press(vibe);
    await waitFor(() => {
      expect(
        getByLabelText('Chọn vibe Leo rank đêm').props.accessibilityState,
      ).toMatchObject({ selected: true });
    });

    await fireEvent.press(getByLabelText('Nhắn Khoa Jungle'));
    expect(mockExpoRouter.router.push).toHaveBeenCalledWith(
      appRoutes.main.messages,
    );
  });

  it.each([360, 375, 414])(
    'keeps every Vibe artwork sized to its card at %idp',
    async (width) => {
      setWindowMetrics(width, 1.15);

      const { getByTestId } = await renderDiscoverScreen(
        <ExploreScreen />,
        createSafeAreaMetrics(width),
      );

      for (const card of discoverVibeCards) {
        const vibeCard = getByTestId(`vibe-card-${card.title}`);
        const vibeBackground = getByTestId(`vibe-background-${card.title}`);
        const vibeGradient = getByTestId(`vibe-gradient-${card.title}`);
        const vibeContent = getByTestId(`vibe-content-${card.title}`);

        const cardStyle = StyleSheet.flatten(vibeCard.props.style);
        const backgroundStyle = StyleSheet.flatten(vibeBackground.props.style);

        expect(cardStyle.height).toBe(134);
        expectSizedArtworkLayer(backgroundStyle, cardStyle.width);
        expect(vibeBackground.props.source).toBe(card.background);
        expectAbsoluteFillLayer(StyleSheet.flatten(vibeGradient.props.style));
        expectBottomAnchoredContent(
          StyleSheet.flatten(vibeContent.props.style),
        );
      }
    },
  );

  it.each([360, 375])(
    'keeps compact text constraints at %idp with font scale 1.15',
    async (width) => {
      setWindowMetrics(width, 1.15);

      const { getByText } = await renderDiscoverScreen(
        <ExploreScreen />,
        createSafeAreaMetrics(width),
      );

      expect(getByText('Team Sao Băng').props.numberOfLines).toBe(2);
      expect(getByText('Leo rank').props.numberOfLines).toBe(1);
      expect(getByText('Mời vào').props.numberOfLines).toBe(1);
      expect(getByText('Mời vào').children.join('')).not.toContain('...');
    },
  );
});
