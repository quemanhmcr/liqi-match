import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';

import { discoverResolvedMediaSource } from '../model/discover-domain';
import { discoverAllVibeCards } from '../data/discover.mock';
import { resetDiscoverState } from '../model/discover-store';
import { renderDiscoverScreen } from './discover-test-utils';
import { DiscoverMatchesScreen } from '../screens/DiscoverMatchesScreen';
import { DiscoverSetsScreen } from '../screens/DiscoverSetsScreen';
import { DiscoverVibesScreen } from '../screens/DiscoverVibesScreen';

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    LinearGradient: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(View, props, children),
  };
});

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

const mockRouter = jest.requireMock('expo-router') as {
  router: {
    back: ReturnType<typeof jest.fn>;
    push: ReturnType<typeof jest.fn>;
  };
};

function createMetrics(width: number) {
  return {
    frame: { height: 844, width, x: 0, y: 0 },
    insets: { bottom: 34, left: 0, right: 0, top: 47 },
  };
}

function renderScreen(screen: React.ReactElement, width = 390) {
  return renderDiscoverScreen(screen, createMetrics(width));
}

beforeEach(() => {
  resetDiscoverState();
  mockRouter.router.back.mockClear();
  mockRouter.router.push.mockClear();
  Dimensions.set({
    screen: { fontScale: 1, height: 844, scale: 1, width: 390 },
    window: { fontScale: 1, height: 844, scale: 1, width: 390 },
  });
});

describe('Discover child collection screens', () => {
  it('renders the full Vibe collection and supports local search, filters and sort', async () => {
    const { getByLabelText, getByTestId, getByText, queryByText } =
      await renderScreen(<DiscoverVibesScreen />);

    expect(getByTestId('discover-status-bar-light')).toBeTruthy();
    expect(getByText('Vibe hot tối nay')).toBeTruthy();
    expect(getByText('6 vibe đang nổi')).toBeTruthy();
    expect(
      StyleSheet.flatten(
        getByTestId('discover-vibe-card-late-night-rank').props.style,
      ).height,
    ).toBe(150);
    const vibeBackdrop = getByTestId('discover-vibe-backdrop-late-night-rank');
    const vibeArtwork = getByTestId('discover-vibe-artwork-late-night-rank');
    expect(vibeBackdrop.props.resizeMode).toBe('cover');
    expect(vibeBackdrop.props.source).toBe(
      discoverAllVibeCards[0]
        ? discoverResolvedMediaSource(discoverAllVibeCards[0].background)
        : undefined,
    );
    expect(StyleSheet.flatten(vibeBackdrop.props.style)).toMatchObject({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    });
    expect(StyleSheet.flatten(vibeBackdrop.props.style)).not.toHaveProperty(
      'transform',
    );
    expect(vibeArtwork.props.resizeMode).toBe('contain');
    expect(vibeArtwork.props.source).toBe(
      discoverAllVibeCards[0]
        ? discoverResolvedMediaSource(discoverAllVibeCards[0].background)
        : undefined,
    );
    expect(StyleSheet.flatten(vibeArtwork.props.style)).toMatchObject({
      bottom: 0,
      height: 150,
      right: 0,
      top: 0,
      width: 150,
    });
    expect(StyleSheet.flatten(vibeArtwork.props.style)).not.toHaveProperty(
      'transform',
    );
    const horizontalFade = getByTestId(
      'discover-vibe-horizontal-fade-late-night-rank',
    );
    expect(horizontalFade.props.end).toEqual({ x: 0.94, y: 0.5 });
    expect(horizontalFade.props.locations).toEqual([0, 0.24, 0.52, 0.78, 1]);
    expect(
      getByLabelText('Tìm trong danh sách Khám phá').props.placeholderTextColor,
    ).toBe('rgba(190,200,232,0.54)');
    expect(
      StyleSheet.flatten(getByLabelText('Mở sắp xếp').props.style),
    ).toMatchObject({ minHeight: 29, paddingHorizontal: 8 });
    expect(getByText('Đấu thường chill')).toBeTruthy();
    expect(queryByText('Đang hot')).toBeNull();
    expect(queryByText('Tìm kiếm và lọc cục bộ')).toBeNull();

    await fireEvent.press(getByLabelText('Lọc danh sách theo Không toxic'));
    await waitFor(() => expect(getByText('2 vibe đang nổi')).toBeTruthy());

    await fireEvent.changeText(
      getByLabelText('Tìm trong danh sách Khám phá'),
      'tri ki cuoi tuan',
    );
    await waitFor(() => {
      expect(getByText('Tri kỉ cuối tuần')).toBeTruthy();
      expect(queryByText('Đấu thường chill')).toBeNull();
    });

    await fireEvent.press(getByLabelText('Mở sắp xếp'));
    await waitFor(() =>
      expect(getByLabelText('Sắp xếp theo Mới nhất')).toBeTruthy(),
    );
    await fireEvent.press(getByLabelText('Sắp xếp theo Mới nhất'));
    await waitFor(() => expect(getByText('Mới nhất')).toBeTruthy());

    await fireEvent.press(getByLabelText('Quay lại Khám phá'));
    expect(mockRouter.router.back).toHaveBeenCalledTimes(1);
  });

  it.each([360, 390, 414])(
    'keeps every wide Vibe focal artwork unscaled at %idp',
    async (width) => {
      Dimensions.set({
        screen: { fontScale: 1, height: 844, scale: 1, width },
        window: { fontScale: 1, height: 844, scale: 1, width },
      });
      const { getByTestId } = await renderScreen(
        <DiscoverVibesScreen />,
        width,
      );

      for (const card of discoverAllVibeCards) {
        const cardStyle = StyleSheet.flatten(
          getByTestId(`discover-vibe-card-${card.id}`).props.style,
        );
        const backdrop = getByTestId(`discover-vibe-backdrop-${card.id}`);
        const artwork = getByTestId(`discover-vibe-artwork-${card.id}`);
        const backdropStyle = StyleSheet.flatten(backdrop.props.style);
        const artworkStyle = StyleSheet.flatten(artwork.props.style);

        expect(cardStyle.height).toBe(150);
        expect(backdrop.props.resizeMode).toBe('cover');
        expect(backdrop.props.source).toBe(
          discoverResolvedMediaSource(card.background),
        );
        expect(backdropStyle).not.toHaveProperty('transform');
        expect(artwork.props.resizeMode).toBe('contain');
        expect(artwork.props.source).toBe(
          discoverResolvedMediaSource(card.background),
        );
        expect(artworkStyle).toMatchObject({
          bottom: 0,
          height: cardStyle.height,
          right: 0,
          top: 0,
          width: cardStyle.height,
        });
        expect(artworkStyle).not.toHaveProperty('transform');
      }
    },
  );

  it('renders match recommendations with local actions and message navigation', async () => {
    const { getByLabelText, getByTestId, getByText, queryByText } =
      await renderScreen(<DiscoverMatchesScreen />);

    expect(getByTestId('discover-status-bar-light')).toBeTruthy();
    expect(getByText('Hợp vibe với bạn')).toBeTruthy();
    expect(getByText('6 người phù hợp')).toBeTruthy();
    expect(getByText('Lyra Mid')).toBeTruthy();
    expect(
      StyleSheet.flatten(
        getByTestId('discover-profile-online-lyra-mid').props.style,
      ),
    ).toMatchObject({ height: 9, width: 9 });
    expect(
      StyleSheet.flatten(
        getByTestId('discover-profile-action-lyra-mid').props.style,
      ).width,
    ).toBe('58%');
    expect(
      StyleSheet.flatten(
        getByTestId('discover-profile-action-nam-support').props.style,
      ).width,
    ).toBe('54%');
    expect(
      StyleSheet.flatten(
        getByTestId('discover-profile-match-lyra-mid').props.style,
      ),
    ).toMatchObject({ paddingHorizontal: 6, paddingVertical: 3 });
    expect(getByTestId('discover-profile-name-lyra-mid').children).toHaveLength(
      1,
    );
    expect(queryByText('Tìm kiếm và lọc cục bộ')).toBeNull();

    await fireEvent.press(getByLabelText('Lọc danh sách theo Không toxic'));
    await waitFor(() => {
      expect(getByText('3 người phù hợp')).toBeTruthy();
      expect(getByText('An Nhi ADC')).toBeTruthy();
      expect(queryByText('Lyra Mid')).toBeNull();
    });
    await fireEvent.press(getByLabelText('Mời vào An Nhi ADC'));
    await waitFor(() => expect(getByText('Đã mời')).toBeTruthy());

    await fireEvent.press(getByLabelText('Xem hồ sơ Nam Support'));
    await waitFor(() => {
      expect(getByLabelText('Xem hồ sơ Nam Support')).toBeTruthy();
      expect(queryByText('Đang xem')).toBeNull();
    });

    expect(queryByText('Nhắn tin')).toBeNull();
    await fireEvent.press(getByLabelText('Nhắn An Nhi ADC'));
    expect(mockRouter.router.push).toHaveBeenCalledWith(
      appRoutes.main.messages,
    );
  });

  it('uses the specialized Sets page with search, filters, sort and back navigation', async () => {
    const { getByLabelText, getByText, queryByText } = await renderScreen(
      <DiscoverSetsScreen />,
    );

    expect(getByText('Set đang cần người')).toBeTruthy();
    expect(getByText(/4 set phù hợp/)).toBeTruthy();
    expect(getByText('Leo rank 5v5')).toBeTruthy();

    await fireEvent.changeText(getByLabelText('Tìm kiếm set'), 'tro thu');
    await waitFor(() => {
      expect(getByText(/2 set phù hợp/)).toBeTruthy();
      expect(getByText('Duo Rừng + Trợ Thủ')).toBeTruthy();
      expect(getByText('Leo rank 5v5')).toBeTruthy();
      expect(queryByText('Team Sao Băng')).toBeNull();
    });

    await fireEvent.press(getByLabelText('Xóa tìm kiếm set'));
    await waitFor(() => {
      expect(getByLabelText('Tìm kiếm set').props.value).toBe('');
      expect(getByText(/4 set phù hợp/)).toBeTruthy();
    });
    await fireEvent.press(getByLabelText('Lọc Set theo Team Rank'));
    await waitFor(() => expect(getByText(/2 set phù hợp/)).toBeTruthy());

    await fireEvent.press(getByLabelText('Sắp xếp danh sách set'));
    await waitFor(() =>
      expect(getByLabelText('Sắp xếp theo Sắp đủ người')).toBeTruthy(),
    );
    await fireEvent.press(getByLabelText('Sắp xếp theo Sắp đủ người'));
    await waitFor(() => expect(getByText('Sắp đủ người')).toBeTruthy());

    await fireEvent.press(getByLabelText('Quay lại Khám phá'));
    expect(mockRouter.router.back).toHaveBeenCalledTimes(1);
  });
});
