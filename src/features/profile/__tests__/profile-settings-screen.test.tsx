import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  BlockedPlayerListPageV2Schema,
  PlayerPrivacyCommandReceiptV2Schema,
  PlayerPrivacySettingsV2Schema,
} from '@/shared/contracts/core-v2';
import type { ProfileViewModel } from '@/features/profile/services/profile-service';
import {
  renderWithProviders,
  testPlayerId,
} from '@/test/render-with-providers';

import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  randomUUID: jest.fn(() => '43000000-0000-4000-8000-000000001401'),
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock('../services/profile-settings-service', () => ({
  fetchProfileSettings: jest.fn(async () => ({
    allowProfileShare: true,
    isDiscoverable: true,
    showWinRate: true,
  })),
  updateDiscoverability: jest.fn(async () => undefined),
  updateProfileSoftSettings: jest.fn(async () => undefined),
}));

const initialPrivacy = PlayerPrivacySettingsV2Schema.parse({
  contractVersion: 2,
  friendshipRequests: 'everyone',
  playerId: testPlayerId,
  presenceVisibility: 'friends',
  profileVisibility: 'everyone',
  sessionInvites: 'friends',
  trustVisibility: 'friends',
  updatedAt: '2026-07-14T13:55:00.000Z',
  version: 1,
});

const profile: ProfileViewModel = {
  bio: 'Privacy test profile',
  displayName: 'Privacy Player',
  favoriteHeroes: [],
  gender: 'hidden',
  id: '01000000-0000-4000-8000-000000001401',
  playerId: testPlayerId,
  playStyleTags: [],
  region: 'Global',
  roleNames: [],
  showWinRate: true,
  stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
  statusLabel: 'Sẵn sàng',
  statusValue: 'ready',
  verified: false,
};

describe('ProfileSettingsScreen Core V2 privacy consumer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates one policy through the privacy provider and renders the authoritative receipt', async () => {
    const updatePrivacy = jest.fn(async (_session: unknown, command: any) =>
      PlayerPrivacyCommandReceiptV2Schema.parse({
        correlationId: command.correlationId,
        eventIds: ['43000000-0000-4000-8000-000000001402'],
        privacy: {
          ...initialPrivacy,
          friendshipRequests: command.friendshipRequests,
          presenceVisibility: command.presenceVisibility,
          profileVisibility: command.profileVisibility,
          sessionInvites: command.sessionInvites,
          trustVisibility: command.trustVisibility,
          updatedAt: '2026-07-14T14:01:00.000Z',
          version: 2,
        },
        repeated: false,
      }),
    );
    const relationshipRuntime = createRelationshipRuntime({ updatePrivacy });
    const screen = await renderWithProviders(<ProfileSettingsScreen />, {
      serviceOverrides: {
        profileRepository: { getProfile: async () => profile },
        relationshipRepository: relationshipRuntime,
      },
    });

    await fireEvent.press(
      await screen.findByLabelText('Ai có thể gửi lời mời kết bạn'),
    );
    await fireEvent.press(
      screen.getByLabelText(
        'Chọn Chỉ người đã match cho Ai có thể gửi lời mời kết bạn',
      ),
    );

    await waitFor(() => expect(updatePrivacy).toHaveBeenCalledTimes(1));
    expect(updatePrivacy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        expectedPrivacyVersion: 1,
        friendshipRequests: 'matched_only',
        presenceVisibility: 'friends',
        profileVisibility: 'everyone',
        sessionInvites: 'friends',
        trustVisibility: 'friends',
      }),
    );
    expect(await screen.findByText('Chỉ người đã match')).toBeTruthy();
  });
  it('refetches the authoritative snapshot after a privacy version conflict', async () => {
    const refreshedPrivacy = PlayerPrivacySettingsV2Schema.parse({
      ...initialPrivacy,
      friendshipRequests: 'nobody',
      updatedAt: '2026-07-14T14:05:00.000Z',
      version: 2,
    });
    const getPrivacy = jest
      .fn<() => Promise<typeof initialPrivacy>>()
      .mockResolvedValueOnce(initialPrivacy)
      .mockResolvedValueOnce(refreshedPrivacy);
    const updatePrivacy = jest.fn(async () => {
      throw Object.assign(new Error('stale privacy version'), {
        code: 'privacy_version_conflict',
        retryable: true,
      });
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const relationshipRuntime = createRelationshipRuntime({
      getPrivacy,
      updatePrivacy,
    });
    const screen = await renderWithProviders(<ProfileSettingsScreen />, {
      serviceOverrides: {
        profileRepository: { getProfile: async () => profile },
        relationshipRepository: relationshipRuntime,
      },
    });

    await fireEvent.press(
      await screen.findByLabelText('Ai có thể gửi lời mời kết bạn'),
    );
    await fireEvent.press(
      screen.getByLabelText(
        'Chọn Chỉ người đã match cho Ai có thể gửi lời mời kết bạn',
      ),
    );

    await waitFor(() => expect(updatePrivacy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getPrivacy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Không ai')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Chưa lưu được quyền riêng tư',
      'Cài đặt đã thay đổi ở thiết bị khác. Hãy tải lại trước khi lưu.',
    );
  });
});

function createRelationshipRuntime(overrides: Record<string, unknown>) {
  const unused = jest.fn(async () => {
    throw new Error('Unexpected social operation in privacy settings test.');
  });
  return {
    acceptFriendship: unused,
    blockPlayer: unused,
    cancelFriendship: unused,
    declineFriendship: unused,
    getPrivacy: jest.fn(async () => initialPrivacy),
    getRelationship: unused,
    getTrustVisibility: unused,
    listBlockedPlayers: jest.fn(async () =>
      BlockedPlayerListPageV2Schema.parse({
        contractVersion: 2,
        items: [],
        nextCursor: null,
        totalCount: 0,
      }),
    ),
    listFriendships: unused,
    mutePlayer: unused,
    removeFriendship: unused,
    reportMessage: unused,
    reportPlayer: unused,
    requestFriendship: unused,
    unblockPlayer: unused,
    unmutePlayer: unused,
    updatePrivacy: unused,
    ...overrides,
  } as never;
}
