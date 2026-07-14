import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import {
  ApiHomeRepository,
  type HomeApiTransport,
} from '../api-home-repository';

const ids = {
  account: '01000000-0000-4000-8000-000000000001',
  avatar: 'd0000000-0000-4000-8000-000000000001',
  conversation: '60000000-0000-4000-8000-000000000001',
  matchClosed: '50000000-0000-4000-8000-000000000003',
  matchPending: '50000000-0000-4000-8000-000000000001',
  matchReady: '50000000-0000-4000-8000-000000000002',
  player: '20000000-0000-4000-8000-000000000001',
  playerClosed: '20000000-0000-4000-8000-000000000004',
  playerPending: '20000000-0000-4000-8000-000000000002',
  playerReady: '20000000-0000-4000-8000-000000000003',
  profile: '30000000-0000-4000-8000-000000000001',
  profileClosed: '30000000-0000-4000-8000-000000000004',
  profilePending: '30000000-0000-4000-8000-000000000002',
  profileReady: '30000000-0000-4000-8000-000000000003',
} as const;

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: {
    id: ids.account,
    user_metadata: { avatar_url: 'https://identity.example/avatar.png' },
  },
};

const currentProfile = {
  avatarMediaId: ids.avatar,
  displayName: 'Current Player',
  handle: 'CurrentPlayer',
  onlineTimePreset: 'Buổi tối',
  playerId: ids.player,
  profileId: ids.profile,
  rankName: 'Cao Thủ',
  roleNames: ['Đi Rừng'],
};

const dashboard = {
  activeMatchIntent: null,
  capabilities: { canDiscover: true, canMessage: true },
  conversations: [
    {
      conversationId: ids.conversation,
      lastMessageAt: '2026-07-14T08:04:00.000Z',
      lastMessagePreview: 'Chào bạn',
      matchId: ids.matchReady,
      participant: {
        avatarUrl: null,
        displayName: 'Ready Player',
        playerId: ids.playerReady,
        profileId: ids.profileReady,
      },
      unreadCount: 4,
    },
  ],
  generatedAt: '2026-07-14T08:05:00.000Z',
  notificationSummary: { unseenCount: 2 },
  playerLifecycle: {
    discoverable: true,
    messagingAllowed: true,
    playerId: ids.player,
    profileId: ids.profile,
    state: 'active',
    updatedAt: '2026-07-14T08:00:00.000Z',
    version: 2,
  },
  recentMatches: [
    {
      conversationId: null,
      createdAt: '2026-07-14T08:00:00.000Z',
      kind: 'team_rank',
      matchId: ids.matchPending,
      matchedPlayer: {
        avatarUrl: null,
        displayName: 'Pending Player',
        playerId: ids.playerPending,
        profileId: ids.profilePending,
      },
      status: 'conversation_pending',
    },
    {
      conversationId: ids.conversation,
      createdAt: '2026-07-14T08:01:00.000Z',
      kind: 'soulmate',
      matchId: ids.matchReady,
      matchedPlayer: {
        avatarUrl: 'https://media.example/ready.png',
        displayName: 'Ready Player',
        playerId: ids.playerReady,
        profileId: ids.profileReady,
      },
      status: 'conversation_ready',
    },
    {
      conversationId: null,
      createdAt: '2026-07-14T08:02:00.000Z',
      kind: 'normal',
      matchId: ids.matchClosed,
      matchedPlayer: {
        avatarUrl: null,
        displayName: 'Closed Player',
        playerId: ids.playerClosed,
        profileId: ids.profileClosed,
      },
      status: 'closed',
    },
  ],
} as const;

function createTransport() {
  const request = jest.fn<HomeApiTransport['request']>();
  request.mockImplementation(async ({ path }) => {
    if (path === 'rpc/get_home_dashboard_v1') return dashboard;
    if (path === 'rpc/get_home_current_profile_v1') return currentProfile;
    throw new Error(`Unexpected Home RPC: ${path}`);
  });
  return { request, transport: { request } };
}

describe('ApiHomeRepository', () => {
  it('loads the authoritative dashboard and current profile in parallel RPCs', async () => {
    const { request, transport } = createTransport();
    const repository = new ApiHomeRepository(transport);

    const result = await repository.getDashboard(session);

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith({
      path: 'rpc/get_home_dashboard_v1',
      session,
    });
    expect(request).toHaveBeenCalledWith({
      path: 'rpc/get_home_current_profile_v1',
      session,
    });
    expect(result.currentProfile).toMatchObject({
      displayName: 'Current Player',
      handle: 'CurrentPlayer',
      rankName: 'Cao Thủ',
      readySummary: 'Thường online Buổi tối',
      roleNames: ['Đi Rừng'],
    });
    expect(result.currentProfile.avatarUrl).toContain(`/media/${ids.avatar}`);
    expect(result.preview).toBe(false);
  });

  it('maps kind, status and unread from server facts instead of array position', async () => {
    const { transport } = createTransport();
    const result = await new ApiHomeRepository(transport).getDashboard(session);

    expect(result.activeMatchCount).toBe(2);
    expect(result.matchedSets).toEqual([
      expect.objectContaining({
        actionLabel: 'Vào lobby',
        id: ids.matchPending,
        kind: 'Team Rank',
        profileId: ids.profilePending,
        status: 'idle',
        unreadCount: 0,
      }),
      expect.objectContaining({
        conversationId: ids.conversation,
        id: ids.matchReady,
        kind: 'Tri kỉ',
        profileId: ids.profileReady,
        status: 'ready',
        unreadCount: 4,
      }),
      expect.objectContaining({
        actionLabel: 'Xem lại',
        id: ids.matchClosed,
        kind: 'Normal',
        profileId: ids.profileClosed,
        status: 'offline',
        unreadCount: 0,
      }),
    ]);
    expect(result.matchedSets.some((item) => item.status === 'online')).toBe(
      false,
    );
  });

  it('keeps mappings stable when the backend order changes', async () => {
    const request = jest.fn<HomeApiTransport['request']>();
    request.mockImplementation(async ({ path }) =>
      path === 'rpc/get_home_dashboard_v1'
        ? {
            ...dashboard,
            recentMatches: [...dashboard.recentMatches].reverse(),
          }
        : currentProfile,
    );

    const result = await new ApiHomeRepository({ request }).getDashboard(
      session,
    );
    const byMatchId = new Map(
      result.matchedSets.map((item) => [item.id, item]),
    );

    expect(byMatchId.get(ids.matchPending)).toMatchObject({
      kind: 'Team Rank',
      status: 'idle',
      unreadCount: 0,
    });
    expect(byMatchId.get(ids.matchReady)).toMatchObject({
      kind: 'Tri kỉ',
      status: 'ready',
      unreadCount: 4,
    });
    expect(byMatchId.get(ids.matchClosed)).toMatchObject({
      kind: 'Normal',
      status: 'offline',
      unreadCount: 0,
    });
  });

  it('rejects a Home response that invents a non-contract status', async () => {
    const request = jest.fn<HomeApiTransport['request']>();
    request.mockImplementation(async ({ path }) =>
      path === 'rpc/get_home_dashboard_v1'
        ? {
            ...dashboard,
            recentMatches: [
              { ...dashboard.recentMatches[0], status: 'online' },
            ],
          }
        : currentProfile,
    );

    await expect(
      new ApiHomeRepository({ request }).getDashboard(session),
    ).rejects.toThrow();
  });
});
