import { describe, expect, it, jest } from '@jest/globals';

import { PlayerTrustProjectionV2Schema } from '@/shared/contracts/core-v2';
import { ProfileShareScreen } from '@/features/profile/screens/ProfileShareScreen';
import type { ProfileViewModel } from '@/features/profile/services/profile-service';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock('@/features/profile/services/profile-settings-service', () => ({
  fetchProfileSettings: jest.fn(async () => ({
    allowProfileShare: true,
    isDiscoverable: true,
    showWinRate: true,
  })),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///profile-share.png'),
}));

const profileWithLegacyStats: ProfileViewModel = {
  bio: 'Bình tĩnh, phối hợp và không toxic.',
  displayName: 'Verified Share Player',
  favoriteHeroes: [],
  gender: 'hidden',
  id: 'legacy-profile-share-1',
  playerId: '20000000-0000-4000-8000-000000000002',
  playStyleTags: ['Không toxic'],
  rankName: 'Cao Thủ',
  region: 'Global',
  roleNames: ['Trợ Thủ'],
  showWinRate: true,
  stats: { matches: 128, rating: 4.8, reputation: 92, winRate: 59 },
  statusLabel: 'Sẵn sàng',
  statusValue: 'ready',
  verified: true,
};

const verifiedProjection = PlayerTrustProjectionV2Schema.parse({
  completedSessions: 7,
  completionReliabilityBps: 8750,
  confirmedModerationActions: 0,
  noShowCount: 1,
  playerId: profileWithLegacyStats.playerId,
  positiveEndorsements: 12,
  projectionVersion: 20,
  rebuiltAt: null,
  repeatTeammateCount: 3,
  updatedAt: '2026-07-14T16:00:00.000Z',
});

describe('ProfileShareScreen authoritative trust surface', () => {
  it('renders verified projection dimensions and never legacy editable stats', async () => {
    const getForPlayer = jest.fn(async () => verifiedProjection);
    const screen = await renderWithProviders(<ProfileShareScreen />, {
      serviceOverrides: {
        playerTrustProjectionProvider: { getForPlayer },
        profileRepository: {
          getProfile: async () => profileWithLegacyStats,
        },
      },
    });

    expect(await screen.findByText('Buổi chơi')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Hoàn tất')).toBeTruthy();
    expect(screen.getByText('88%')).toBeTruthy();
    expect(screen.getByText('Lời khen')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.queryByText('128')).toBeNull();
    expect(screen.queryByText('4.8')).toBeNull();
    expect(screen.queryByText('59%')).toBeNull();
    expect(getForPlayer).toHaveBeenCalledWith(
      testAuthSession,
      profileWithLegacyStats.playerId,
    );
  });

  it('fails closed when the authoritative projection cannot be loaded', async () => {
    const screen = await renderWithProviders(<ProfileShareScreen />, {
      serviceOverrides: {
        playerTrustProjectionProvider: {
          getForPlayer: async () => {
            throw new Error('projection unavailable');
          },
        },
        profileRepository: {
          getProfile: async () => profileWithLegacyStats,
        },
      },
    });

    expect(
      await screen.findByText('Chưa tải được số liệu xác minh'),
    ).toBeTruthy();
    expect(screen.queryByText('128')).toBeNull();
    expect(screen.queryByText('4.8')).toBeNull();
    expect(screen.queryByText('59%')).toBeNull();
  });
});
