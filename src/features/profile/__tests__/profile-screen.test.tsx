import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { createAssetKey, type AssetResolver } from '@/entities/media-asset';
import { createEmptyHabitAnswers } from '@/entities/player-profile';
import {
  PlayerTrustProjectionV2Schema,
  SocialRelationshipCommandReceiptV2Schema,
  SocialRelationshipSnapshotV2Schema,
  type SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import type { ProfileViewModel } from '@/features/profile/services/profile-service';
import { profileUi } from '@/features/profile/ui/profile-ui';
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
  router: {
    back: ReturnType<typeof jest.fn>;
    canGoBack: ReturnType<typeof jest.fn>;
    navigate: ReturnType<typeof jest.fn>;
    push: ReturnType<typeof jest.fn>;
  };
};

function setWindowMetrics(width: number) {
  const metrics = { fontScale: 1, height: 844, scale: 1, width };
  Dimensions.set({ screen: metrics, window: metrics });
}

afterEach(() => {
  setWindowMetrics(400);
  mockedRouter.router.canGoBack.mockReturnValue(true);
});

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
  habitAnswers: {
    ...createEmptyHabitAnswers(),
    decisionStyleId: 'decision.discuss',
    strategyStyleIds: ['strategy.protect'],
    teamGoalIds: ['goal.rank-climb'],
  },
  id: 'legacy-profile-canonical-1',
  playerId: '20000000-0000-4000-8000-000000000002',
  playStyleTags: ['Không toxic', 'Có voice'],
  rankName: 'Cao Thủ',
  region: 'Global',
  roleNames: ['Trợ Thủ'],
  showWinRate: true,
  socialStats: { completedSessionCount: 48, likeCount: 1284, matchCount: 96 },
  stats: { matches: 128, rating: 4.8, reputation: 92, winRate: 59 },
  statusLabel: 'Sẵn sàng',
  statusValue: 'ready',
  verified: true,
};

describe('ProfileScreen repository consumer', () => {
  it('keeps social counters separate from trust evidence and legacy editable stats', async () => {
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
    expect(
      screen.getByTestId('profile-social-stat-value-0').props.children,
    ).toBe('1,3K');
    expect(
      screen.getByTestId('profile-social-stat-value-1').props.children,
    ).toBe('96');
    expect(
      screen.getByTestId('profile-social-stat-value-2').props.children,
    ).toBe('48');
    expect(screen.getByText('Lượt thích')).toBeTruthy();
    expect(screen.getByText('Đã match')).toBeTruthy();
    expect(screen.getByText('Đã chơi')).toBeTruthy();
    expect(screen.getByText('88% độ tin cậy')).toBeTruthy();
    expect(screen.getByText('12 lời khen xác minh')).toBeTruthy();
    expect(screen.queryByText('128')).toBeNull();
    expect(screen.queryByText('4.8')).toBeNull();
    expect(screen.queryByText('92')).toBeNull();
  });

  it('does not present an empty trust projection as zero-percent reliability', async () => {
    const emptyProjection = PlayerTrustProjectionV2Schema.parse({
      completedSessions: 0,
      completionReliabilityBps: 0,
      confirmedModerationActions: 0,
      noShowCount: 0,
      playerId: canonicalProfile.playerId,
      positiveEndorsements: 0,
      projectionVersion: 1,
      rebuiltAt: null,
      repeatTeammateCount: 0,
      updatedAt: '2026-07-14T16:00:00.000Z',
    });
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          playerTrustProjectionProvider: {
            getForPlayer: async () => emptyProjection,
          },
          profileRepository: { getProfile: async () => canonicalProfile },
        },
      },
    );

    expect(
      await screen.findByText('Nguồn: hoạt động đã xác minh trên LiQi'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Chưa đủ hoạt động đã xác minh để hình thành tín hiệu uy tín.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Chưa đủ dữ liệu uy tín')).toBeTruthy();
    expect(screen.getByText('Chưa có lời khen xác minh')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText('0 lời khen xác minh')).toBeNull();
  });

  it('fails closed when the future social projection is not available', async () => {
    const { socialStats: _socialStats, ...profileWithoutSocialStats } =
      canonicalProfile;
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          playerTrustProjectionProvider: {
            getForPlayer: async () =>
              PlayerTrustProjectionV2Schema.parse({
                completedSessions: 27,
                completionReliabilityBps: 9000,
                confirmedModerationActions: 0,
                noShowCount: 1,
                playerId: canonicalProfile.playerId,
                positiveEndorsements: 4,
                projectionVersion: 1,
                rebuiltAt: null,
                repeatTeammateCount: 2,
                updatedAt: '2026-07-14T16:00:00.000Z',
              }),
          },
          profileRepository: {
            getProfile: async () => profileWithoutSocialStats,
          },
        },
      },
    );

    await screen.findByText('Canonical Player');
    expect(
      screen.getByTestId('profile-social-stat-value-0').props.children,
    ).toBe('—');
    expect(
      screen.getByTestId('profile-social-stat-value-1').props.children,
    ).toBe('—');
    expect(
      screen.getByTestId('profile-social-stat-value-2').props.children,
    ).toBe('—');
    expect(screen.queryByText('128')).toBeNull();
  });

  it('does not advertise Profile workflows whose routes are still reset', async () => {
    const screen = await renderWithProviders(<ProfileScreen mode="self" />, {
      serviceOverrides: {
        profileRepository: { getProfile: async () => canonicalProfile },
      },
    });

    expect(await screen.findByTestId('profile-identity-header')).toBeTruthy();
    expect(screen.queryByLabelText('Cài đặt hồ sơ')).toBeNull();
    expect(screen.queryByLabelText('Chỉnh sửa hồ sơ')).toBeNull();
    expect(screen.queryByLabelText('Chia sẻ hồ sơ')).toBeNull();
    expect(screen.queryByLabelText('Quản lý khoảnh khắc')).toBeNull();
    expect(screen.queryByLabelText('Mở chỉnh sửa phong cách chơi')).toBeNull();
    expect(screen.queryByLabelText('Mở chi tiết uy tín')).toBeNull();
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

  it('renders the Profile-owned reference composition without presenting artwork as user data', async () => {
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          profileRepository: { getProfile: async () => canonicalProfile },
        },
      },
    );

    expect(await screen.findByTestId('profile-highlight-summary')).toBeTruthy();
    expect(screen.getByTestId('profile-play-style-gallery')).toBeTruthy();
    expect(screen.getByText('Leo rank nghiêm túc')).toBeTruthy();
    expect(screen.getByText('Cùng phân tích')).toBeTruthy();
    expect(screen.getByText('Bảo kê đồng đội')).toBeTruthy();
    expect(screen.getByText('MỤC TIÊU')).toBeTruthy();
    expect(screen.getByText('PHỐI HỢP')).toBeTruthy();
    expect(screen.getByText('CHIẾN THUẬT')).toBeTruthy();
    expect(screen.queryByTestId('profile-play-style-description-0')).toBeNull();
    expect(screen.getByTestId('profile-memory-section')).toBeTruthy();
    expect(screen.getByTestId('profile-social-stats')).toBeTruthy();
    expect(screen.getByTestId('profile-trust-story')).toBeTruthy();
    expect(screen.getByText('Chiến binh mới')).toBeTruthy();
    expect(screen.getByText('LiQi cấp')).toBeTruthy();
    expect(screen.queryByText('Trạng thái trống')).toBeNull();
    expect(screen.getByText('Lời khen & uy tín')).toBeTruthy();
    expect(screen.getByText('DỮ LIỆU UY TÍN')).toBeTruthy();
    expect(screen.queryByText(/Admin LiQi/)).toBeNull();
  });

  it('normalizes profile bio punctuation without duplicating rank as a chip', async () => {
    const profile: ProfileViewModel = {
      ...canonicalProfile,
      availability: {
        slots: [
          { dayOfWeek: 1, endMinute: 1380, startMinute: 1140 },
          { dayOfWeek: 3, endMinute: 1380, startMinute: 1140 },
        ],
        timezone: 'Asia/Ho_Chi_Minh',
      },
      bio: 'Teamwork, giao tranh sạch, không toxic., Mic on',
      gender: 'female',
      playStyleTags: ['Cạnh tranh', 'Mic on'],
    };
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          profileRepository: { getProfile: async () => profile },
        },
      },
    );

    expect(
      await screen.findByText('Teamwork, giao tranh sạch, không toxic. Mic on'),
    ).toBeTruthy();
    expect(screen.getByText('Cao Thủ · Trợ Thủ · Nữ')).toBeTruthy();
    expect(screen.queryByText('Global')).toBeNull();
    expect(screen.getByText('T2, T4 · Tối')).toBeTruthy();
    expect(screen.getByText('Aya')).toBeTruthy();
    expect(screen.queryByText('Cao Thủ')).toBeNull();
  });

  it('keeps long display names inside the identity row without displacing verification', async () => {
    const displayName = 'Nguyễn Hoàng Minh Anh Siêu Dài Nhưng Vẫn Có Badge';
    const profile: ProfileViewModel = {
      ...canonicalProfile,
      displayName,
    };
    const screen = await renderWithProviders(<ProfileScreen mode="self" />, {
      serviceOverrides: {
        profileRepository: { getProfile: async () => profile },
      },
    });

    await screen.findByText(displayName);
    const displayNameNode = screen.getByTestId('profile-hero-display-name');
    const verifiedBadge = screen.getByTestId('profile-hero-verified-badge');

    expect(displayNameNode.props.numberOfLines).toBe(1);
    expect(displayNameNode.props.adjustsFontSizeToFit).toBe(true);
    expect(StyleSheet.flatten(displayNameNode.props.style)).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0 }),
    );
    expect(StyleSheet.flatten(verifiedBadge.props.style).flexShrink).toBe(0);
  });

  it('uses compact Profile geometry below 390dp', async () => {
    setWindowMetrics(360);
    const screen = await renderWithProviders(<ProfileScreen mode="self" />, {
      serviceOverrides: {
        profileRepository: { getProfile: async () => canonicalProfile },
      },
    });

    await screen.findByText('Canonical Player');
    expect(
      StyleSheet.flatten(screen.getByTestId('profile-hero-cover').props.style)
        .height,
    ).toBe(152);
    expect(
      StyleSheet.flatten(screen.getByTestId('profile-avatar-frame').props.style)
        .width,
    ).toBe(70);
    expect(screen.getByTestId('profile-hero-compact-details')).toBeTruthy();
    expect(screen.getByTestId('profile-hero-bio').props.numberOfLines).toBe(2);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-highlight-item-content-0').props.style,
      ).minHeight,
    ).toBe(64);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-highlight-icon-0').props.style,
      ).width,
    ).toBe(24);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-play-style-tile-0').props.style,
      ).width,
    ).toBe(144);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-play-style-tile-0').props.style,
      ).aspectRatio,
    ).toBe(3 / 4);
    expect(
      screen.getByTestId('profile-play-style-rail').props.snapToInterval,
    ).toBe(profileUi.playStyle.tileWidthCompact + profileUi.playStyle.gap);
    expect(
      screen.getByTestId('profile-play-style-rail').props
        .disableIntervalMomentum,
    ).toBe(true);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-memory-starter').props.style,
      ).aspectRatio,
    ).toBe(2);
    expect(
      screen.getByTestId('profile-play-style-image-0').props.contentFit,
    ).toBe('contain');
    expect(
      screen.getByTestId('profile-play-style-image-0').props.contentPosition,
    ).toEqual({ left: '50%', top: 0 });
    expect(
      screen.getByTestId('profile-memory-starter-image').props.contentFit,
    ).toBe('cover');
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-memory-section-content').props.style,
      ).padding,
    ).toBe(0);
    expect(screen.getByTestId('profile-memory-header-overlay')).toBeTruthy();
    expect(
      screen.getByTestId('profile-trust-description').props.numberOfLines,
    ).toBeUndefined();
    expect(screen.getByText('DỮ LIỆU UY TÍN')).toBeTruthy();
    expect(
      StyleSheet.flatten(
        screen.getByTestId('profile-trust-story-content').props.style,
      ).backgroundColor,
    ).toBe(profileUi.colors.trustSurface);
    expect(screen.queryByTestId('profile-bottom-reading-inset')).toBeNull();
  });

  it('keeps the LiQi starter first and appends recoverable user media', async () => {
    const wallUrl = 'https://media.example.test/profile/memory-1.jpg';
    const profile: ProfileViewModel = {
      ...canonicalProfile,
      wallUrls: [wallUrl],
    };
    const screen = await renderWithProviders(
      <ProfileScreen identityId="player-canonical-1" mode="other" />,
      {
        serviceOverrides: {
          profileRepository: { getProfile: async () => profile },
        },
      },
    );

    expect(await screen.findByTestId('profile-memory-starter')).toBeTruthy();
    expect(screen.getByText('Chiến binh mới')).toBeTruthy();
    expect(screen.getByTestId('profile-memory-user-0')).toBeTruthy();
    expect(screen.getByText('Khoảnh khắc đã chia sẻ')).toBeTruthy();
    expect(screen.getByText('Media hồ sơ')).toBeTruthy();
    const userImage = screen.getByTestId('profile-memory-user-image-0');
    expect(userImage.props.source).toEqual([{ uri: wallUrl }]);
    expect(userImage.props.contentFit).toBe('contain');
    expect(userImage.props.cachePolicy).toBe('memory-disk');
    expect(screen.getByLabelText('Khoảnh khắc 1 trên 2')).toBeTruthy();

    await fireEvent(
      screen.getByTestId('profile-memory-user-image-0'),
      'error',
      {
        nativeEvent: { error: 'test image failure' },
      },
    );
    expect(await screen.findByText('Chưa thể tải khoảnh khắc')).toBeTruthy();
    expect(screen.getByText('Tạm dùng ảnh hệ thống')).toBeTruthy();
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

    expect(await screen.findByTestId('profile-identity-hero')).toBeTruthy();
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
    expect(screen.getByTestId('profile-read-state-back-action')).toBeTruthy();
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

  it('renders not-found and falls back to Home when no back stack exists', async () => {
    const getProfile = jest.fn(async () => null);
    mockedRouter.router.back.mockClear();
    mockedRouter.router.navigate.mockClear();
    mockedRouter.router.canGoBack.mockReturnValueOnce(false);
    const screen = await renderWithProviders(
      <ProfileScreen identityId="missing-player" mode="other" />,
      { serviceOverrides: { profileRepository: { getProfile } } },
    );

    expect(await screen.findByText('Không tìm thấy hồ sơ')).toBeTruthy();
    expect(screen.queryByText('Khoa Jungle')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockedRouter.router.back).not.toHaveBeenCalled();
    expect(mockedRouter.router.navigate).toHaveBeenCalledWith(
      appRoutes.main.home,
    );
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
