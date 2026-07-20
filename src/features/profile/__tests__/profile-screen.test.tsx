import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { createAssetKey, type AssetResolver } from '@/entities/media-asset';
import {
  PlayerTrustProjectionV2Schema,
  SocialRelationshipCommandReceiptV2Schema,
  SocialRelationshipSnapshotV2Schema,
  type SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import type { ProfileViewModel } from '@/features/profile/services/profile-service';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  randomUUID: jest.fn(() => '43000000-0000-4000-8000-000000000900'),
}));

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
  id: 'legacy-profile-canonical-1',
  playerId: '20000000-0000-4000-8000-000000000002',
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
  it('renders only authoritative explainable trust dimensions and never legacy editable stats', async () => {
    const getForPlayer = jest.fn(async () =>
      PlayerTrustProjectionV2Schema.parse({
        completedSessions: 7,
        completionReliabilityBps: 8750,
        confirmedModerationActions: 0,
        noShowCount: 1,
        playerId: canonicalProfile.playerId,
        positiveEndorsements: 12,
        projectionVersion: 20,
        rebuiltAt: null,
        repeatTeammateCount: 3,
        updatedAt: '2026-07-14T16:00:00.000Z',
      }),
    );
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          playerTrustProjectionProvider: { getForPlayer },
          profileRepository: { getProfile: async () => canonicalProfile },
        },
      },
    );

    await waitFor(() =>
      expect(getForPlayer).toHaveBeenCalledWith(
        testAuthSession,
        canonicalProfile.playerId,
      ),
    );
    expect(await screen.findByText('7')).toBeTruthy();
    expect(screen.getByText('88%')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Buổi đã chơi')).toBeTruthy();
    expect(screen.getByText('Độ tin cậy')).toBeTruthy();
    expect(screen.getByText('Đồng đội quen')).toBeTruthy();
    expect(screen.queryByText('128')).toBeNull();
    expect(screen.queryByText('4.8')).toBeNull();
    expect(screen.queryByText('92')).toBeNull();
  });

  it('keeps mature self-profile workflows reachable through the shared identity header and sections', async () => {
    mockedRouter.router.push.mockClear();
    const screen = await renderWithProviders(<ProfileScreen mode="self" />, {
      serviceOverrides: {
        profileRepository: { getProfile: async () => canonicalProfile },
      },
    });

    expect(await screen.findByTestId('profile-identity-header')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cài đặt hồ sơ'));
    await fireEvent.press(screen.getByLabelText('Chỉnh sửa hồ sơ'));
    await fireEvent.press(screen.getByLabelText('Quản lý khoảnh khắc'));
    await fireEvent.press(screen.getByLabelText('Chia sẻ hồ sơ'));

    expect(mockedRouter.router.push).toHaveBeenCalledWith(
      appRoutes.profile.settings,
    );
    expect(mockedRouter.router.push).toHaveBeenCalledWith(
      appRoutes.profile.edit,
    );
    expect(mockedRouter.router.push).toHaveBeenCalledWith(
      appRoutes.profile.gallery,
    );
    expect(mockedRouter.router.push).toHaveBeenCalledWith(
      appRoutes.profile.share,
    );
  });

  it('uses the canonical route userId and renders the repository projection', async () => {
    const getProfile = jest.fn(async () => canonicalProfile);
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Canonical Player')).toBeTruthy();
    expect(getProfile).toHaveBeenCalledWith({
      session: testAuthSession,
      identityId: 'player-canonical-1',
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
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          assetResolver: unavailableAssetResolver,
          profileRepository: { getProfile },
        },
      },
    );

    expect(
      await screen.findByLabelText('Không gian fantasy của hồ sơ LiQi'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Ảnh bìa hồ sơ offline-unavailable'),
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
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
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

  it('executes friendship commands through the authoritative V2 provider and applies the receipt', async () => {
    const initialRelationship = relationshipSnapshot('none');
    const requestedRelationship = relationshipSnapshot('pending_outgoing');
    const requestFriendship = jest.fn(async (_session: unknown, command: any) =>
      SocialRelationshipCommandReceiptV2Schema.parse({
        correlationId: command.correlationId,
        eventIds: ['43000000-0000-4000-8000-000000000901'],
        relationship: requestedRelationship,
        repeated: false,
      }),
    );
    const relationshipRuntime = createRelationshipRuntime({
      getRelationship: jest.fn(async () => initialRelationship),
      requestFriendship,
    });
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          profileRepository: { getProfile: async () => canonicalProfile },
          relationshipRepository: relationshipRuntime,
        },
      },
    );

    expect(await screen.findByText('Chưa kết bạn')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Kết bạn'));

    await waitFor(() => expect(requestFriendship).toHaveBeenCalledTimes(1));
    expect(requestFriendship.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        expectedRelationshipVersion: 0,
        targetPlayerId: canonicalProfile.playerId,
      }),
    );
    expect(await screen.findByText('Đã gửi lời mời')).toBeTruthy();
  });

  it('fails closed for profile interaction when the authority reports a block', async () => {
    const relationshipRuntime = createRelationshipRuntime({
      getRelationship: jest.fn(async () => relationshipSnapshot('none', true)),
    });
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          profileRepository: { getProfile: async () => canonicalProfile },
          relationshipRepository: relationshipRuntime,
        },
      },
    );

    expect(await screen.findByText('Đã chặn')).toBeTruthy();
    mockedRouter.router.push.mockClear();
    await fireEvent.press(screen.getByLabelText('Nhắn tin'));
    expect(mockedRouter.router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Gỡ chặn')).toBeTruthy();
  });
  it('shows retry only for an explicit retryable profile failure', async () => {
    const getProfile = jest.fn(async () => {
      throw Object.assign(new Error('Profile API unavailable'), {
        code: 'network_error',
        retryable: true,
      });
    });
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
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
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
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
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
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
      <ProfileScreen identityId="missing-player" mode="other" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Không tìm thấy hồ sơ')).toBeTruthy();
    expect(screen.queryByText('Khoa Jungle')).toBeNull();
  });
});

function relationshipSnapshot(
  label: SocialRelationshipSnapshotV2['friendship']['label'],
  blocked = false,
) {
  const pending = label === 'pending_incoming' || label === 'pending_outgoing';
  const friend = label === 'friend';
  return SocialRelationshipSnapshotV2Schema.parse({
    block: {
      targetBlocksViewer: false,
      viewerBlocksTarget: blocked,
    },
    capabilities: {
      blocked,
      canAcceptFriendship: !blocked && label === 'pending_incoming',
      canBlock: !blocked,
      canCancelFriendship: !blocked && label === 'pending_outgoing',
      canDeclineFriendship: !blocked && label === 'pending_incoming',
      canDiscover: !blocked,
      canInviteToSession: !blocked && friend,
      canMessage: !blocked && friend,
      canMute: !blocked,
      canRemoveFriendship: !blocked && friend,
      canReport: true,
      canRequestFriendship: !blocked && label === 'none',
      canUnblock: blocked,
      canUnmute: false,
      canViewConversation: !blocked && friend,
      canViewPresence: !blocked && friend,
      canViewProfile: !blocked,
      friendshipLabel: label,
      muted: false,
    },
    contractVersion: 2,
    friendship: {
      acceptedAt: friend ? '2026-07-14T15:00:00.000Z' : null,
      label,
      requestId: pending ? '42000000-0000-4000-8000-000000000901' : null,
      requestState: pending ? 'pending' : null,
      requestVersion: pending ? 1 : null,
      state: friend ? 'accepted' : pending ? 'pending' : 'none',
    },
    mute: { viewerMutedTarget: false },
    relationshipId: '41000000-0000-4000-8000-000000000901',
    targetPlayerId: canonicalProfile.playerId,
    targetPrivacy: {
      contractVersion: 2,
      friendshipRequests: 'everyone',
      playerId: canonicalProfile.playerId,
      presenceVisibility: 'friends',
      profileVisibility: 'everyone',
      sessionInvites: 'friends',
      trustVisibility: 'friends',
      updatedAt: '2026-07-14T15:00:00.000Z',
      version: 1,
    },
    updatedAt: '2026-07-14T15:00:00.000Z',
    version: label === 'none' && !blocked ? 0 : 1,
    viewerPlayerId: testAuthSession.principal!.playerId,
  });
}

function createRelationshipRuntime(overrides: Record<string, unknown>) {
  const unused = jest.fn(async () => {
    throw new Error('Unexpected social command in profile consumer test.');
  });
  return {
    acceptFriendship: unused,
    blockPlayer: unused,
    cancelFriendship: unused,
    declineFriendship: unused,
    getPrivacy: unused,
    getRelationship: jest.fn(async () => relationshipSnapshot('none')),
    getTrustVisibility: unused,
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
