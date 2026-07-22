import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  saveToLibraryAsync: jest.fn(async () => undefined),
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

const mockCaptureRef = jest.mocked(captureRef);
const mockShareAsync = jest.mocked(Sharing.shareAsync);

beforeEach(() => {
  mockCaptureRef.mockClear();
  mockShareAsync.mockClear();
});

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

  it('exports the default story preset at canonical dimensions', async () => {
    const screen = await renderWithProviders(<ProfileShareScreen />, {
      serviceOverrides: {
        playerTrustProjectionProvider: {
          getForPlayer: async () => verifiedProjection,
        },
        profileRepository: {
          getProfile: async () => profileWithLegacyStats,
        },
      },
    });
    await screen.findByText('Buổi chơi');

    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Chia sẻ ảnh hồ sơ'));
    });

    await waitFor(() =>
      expect(mockCaptureRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ height: 1920, width: 1080 }),
      ),
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///profile-share.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });

  it('does not present zero-percent completion when there is no reliability sample', async () => {
    const emptyProjection = PlayerTrustProjectionV2Schema.parse({
      completedSessions: 0,
      completionReliabilityBps: 0,
      confirmedModerationActions: 0,
      noShowCount: 0,
      playerId: profileWithLegacyStats.playerId,
      positiveEndorsements: 0,
      projectionVersion: 1,
      rebuiltAt: null,
      repeatTeammateCount: 0,
      updatedAt: '2026-07-14T16:00:00.000Z',
    });
    const screen = await renderWithProviders(<ProfileShareScreen />, {
      serviceOverrides: {
        playerTrustProjectionProvider: {
          getForPlayer: async () => emptyProjection,
        },
        profileRepository: {
          getProfile: async () => profileWithLegacyStats,
        },
      },
    });

    expect(
      (await screen.findByTestId('profile-share-stat-Hoàn tất')).props.children,
    ).toBe('—');
    expect(screen.queryByText('0%')).toBeNull();
  });
});
