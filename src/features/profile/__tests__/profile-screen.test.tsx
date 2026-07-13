import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { createAssetKey, type AssetResolver } from '@/entities/media-asset';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import type { ProfileViewModel } from '@/features/profile/services/profile-service';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    navigate: jest.fn(),
    push: jest.fn(),
  },
}));

const mockedRouter = jest.requireMock('expo-router') as {
  router: { push: ReturnType<typeof jest.fn> };
};

const unavailableAssetResolver: AssetResolver = {
  async invalidate() {},
  async preload() {},
  resolve(key) {
    return {
      fallback: 'media-neutral',
      key,
      retryable: true,
      state: 'offline-unavailable',
    };
  },
};

const canonicalProfile: ProfileViewModel = {
  bio: 'Bình tĩnh, phối hợp và không toxic.',
  conversationId: 'conversation:canonical-player',
  displayName: 'Canonical Player',
  favoriteHeroes: [
    { heroId: 'hero-1', name: 'Aya', slug: 'aya', winRate: 61 },
    { heroId: 'hero-2', name: 'Helen', slug: 'helen', winRate: 58 },
    { heroId: 'hero-3', name: 'Annette', slug: 'annette', winRate: 56 },
  ],
  gender: 'hidden',
  id: 'player-canonical-1',
  playStyleTags: ['Không toxic', 'Có voice'],
  rankName: 'Cao Thủ',
  region: 'Global',
  roleNames: ['Trợ Thủ'],
  showWinRate: true,
  stats: { matches: 128, rating: 4.8, reputation: 92, winRate: 59 },
  statusLabel: 'Sẵn sàng',
  statusValue: 'ready',
  verified: true,
};

describe('ProfileScreen repository consumer', () => {
  it('uses the canonical route userId and renders the repository projection', async () => {
    const getProfile = jest.fn(async () => canonicalProfile);
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Canonical Player')).toBeTruthy();
    expect(getProfile).toHaveBeenCalledWith({
      session: testAuthSession,
      userId: 'player-canonical-1',
    });
  });

  it('renders explicit unavailable states for canonical profile media', async () => {
    const profile: ProfileViewModel = {
      ...canonicalProfile,
      avatarAssetKey: createAssetKey('asset:profile:test:avatar'),
      coverAssetKey: createAssetKey('asset:profile:test:cover'),
      wallAssetKeys: [createAssetKey('asset:profile:test:wall-1')],
    };
    const getProfile = jest.fn(async () => profile);
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      {
        serviceOverrides: {
          assetResolver: unavailableAssetResolver,
          profileRepository: { getProfile },
        },
      },
    );

    expect(
      await screen.findByLabelText('Ảnh bìa hồ sơ offline-unavailable'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Avatar hồ sơ offline-unavailable'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Khoảnh khắc hồ sơ offline-unavailable'),
    ).toBeTruthy();
  });

  it('opens the canonical conversation exposed by the profile repository', async () => {
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      {
        serviceOverrides: {
          profileRepository: { getProfile: async () => canonicalProfile },
        },
      },
    );

    await fireEvent.press(await screen.findByLabelText('Nhắn tin'));

    expect(mockedRouter.router.push).toHaveBeenCalledWith({
      pathname: '/messages/[conversationId]',
      params: { conversationId: 'conversation:canonical-player' },
    });
  });

  it('shows retry only for an explicit retryable profile failure', async () => {
    const getProfile = jest.fn(async () => {
      throw Object.assign(new Error('Profile API unavailable'), {
        code: 'network_error',
        retryable: true,
      });
    });
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Không thể tải hồ sơ')).toBeTruthy();
    expect(screen.queryByText('Khoa Jungle')).toBeNull();
    expect(screen.getByLabelText('Thử tải lại hồ sơ')).toBeTruthy();
  });

  it('does not offer retry for a non-retryable profile failure', async () => {
    const getProfile = jest.fn(async () => {
      throw Object.assign(new Error('Invalid profile request'), {
        code: 'validation_failed',
        retryable: false,
      });
    });
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Không thể tải hồ sơ')).toBeTruthy();
    expect(screen.queryByLabelText('Thử tải lại hồ sơ')).toBeNull();
  });

  it('keeps the last profile projection visible when refresh fails', async () => {
    const getProfile = jest
      .fn<(input: unknown) => Promise<ProfileViewModel | null>>()
      .mockResolvedValueOnce(canonicalProfile)
      .mockRejectedValueOnce(
        Object.assign(new Error('Profile refresh unavailable'), {
          code: 'network_error',
          retryable: true,
        }),
      );
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );
    expect(await screen.findByText('Canonical Player')).toBeTruthy();

    await act(async () => {
      await screen.queryClient.refetchQueries({ queryKey: ['profile-view'] });
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText('Hồ sơ đang hiển thị dữ liệu cũ'),
      ).toBeTruthy();
    });
    expect(screen.getByText('Canonical Player')).toBeTruthy();
  });

  it('renders not-found when the repository has no projection', async () => {
    const getProfile = jest.fn(async () => null);
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="missing-player" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Không tìm thấy hồ sơ')).toBeTruthy();
    expect(screen.queryByText('Khoa Jungle')).toBeNull();
  });
});
