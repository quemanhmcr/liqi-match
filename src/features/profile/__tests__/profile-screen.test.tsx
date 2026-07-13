import { describe, expect, it, jest } from '@jest/globals';

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

const canonicalProfile: ProfileViewModel = {
  bio: 'Bình tĩnh, phối hợp và không toxic.',
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

  it('shows an explicit error instead of rendering a preview profile', async () => {
    const getProfile = jest.fn(async () => {
      throw new Error('Profile API unavailable');
    });
    const screen = await renderWithProviders(
      <ProfileScreen mode="other" userId="player-canonical-1" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Không thể tải hồ sơ')).toBeTruthy();
    expect(screen.queryByText('Khoa Jungle')).toBeNull();
    expect(screen.getByLabelText('Thử tải lại hồ sơ')).toBeTruthy();
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
