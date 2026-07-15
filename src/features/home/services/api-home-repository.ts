import {
  HomeCurrentProfileV1Schema,
  HomeDashboardV1Schema,
  type HomeCurrentProfileV1,
  type HomeDashboardV1,
  type HomeMatchKindV1,
  type HomeMatchStatusV1,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type {
  CurrentHomeProfile,
  HomeDashboard,
  MatchedSet,
  MatchedSetStatus,
} from '../home-dashboard-service';
import type { HomeRepository } from '../runtime/HomeRepositoryProvider';

export type HomeApiRequest = Readonly<{
  path: string;
  session: AuthSession;
  signal?: AbortSignal;
}>;

export type HomeApiTransport = Readonly<{
  request(request: HomeApiRequest): Promise<unknown>;
}>;

export class ApiHomeRepository implements HomeRepository {
  constructor(private readonly transport: HomeApiTransport) {}

  async getDashboard(session: AuthSession): Promise<HomeDashboard> {
    const [dashboardResponse, currentProfileResponse] = await Promise.all([
      this.transport.request({
        path: 'rpc/get_home_dashboard_v1',
        session,
      }),
      this.transport.request({
        path: 'rpc/get_home_current_profile_v1',
        session,
      }),
    ]);

    return mapApiHomeDashboard(
      HomeDashboardV1Schema.parse(dashboardResponse),
      HomeCurrentProfileV1Schema.parse(currentProfileResponse),
      session,
    );
  }
}

export function createApiHomeRepository(
  transport: HomeApiTransport = createHomeSupabaseTransport(),
) {
  return new ApiHomeRepository(transport);
}

export function createHomeSupabaseTransport(): HomeApiTransport {
  return {
    request: ({ path, session, signal }) =>
      supabaseRest<unknown>(path, {
        method: 'POST',
        session,
        signal,
      }),
  };
}

export function mapApiHomeDashboard(
  dashboard: HomeDashboardV1,
  currentProfile: HomeCurrentProfileV1,
  session: AuthSession,
): HomeDashboard {
  const conversations = new Map(
    dashboard.conversations.map((conversation) => [
      conversation.conversationId,
      conversation,
    ]),
  );
  const matchedSets = dashboard.recentMatches.map((match) => {
    const conversation = match.conversationId
      ? conversations.get(match.conversationId)
      : undefined;
    return mapMatch(match, conversation?.unreadCount ?? 0);
  });

  return {
    activeMatchCount: dashboard.recentMatches.filter(
      (match) => match.status !== 'closed',
    ).length,
    currentProfile: mapCurrentProfile(currentProfile, dashboard, session),
    matchedSets,
    preview: false,
  };
}

function mapCurrentProfile(
  profile: HomeCurrentProfileV1,
  dashboard: HomeDashboardV1,
  session: AuthSession,
): CurrentHomeProfile {
  const sessionAvatarUrl = avatarUrlFromSession(session);
  const avatarUrl = mediaUrl(profile.avatarMediaId) ?? sessionAvatarUrl;

  return {
    ...(sessionAvatarUrl ? { avatarFallbackUrl: sessionAvatarUrl } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    displayName: profile.displayName,
    ...(profile.handle ? { handle: profile.handle } : {}),
    ...(profile.rankName ? { rankName: profile.rankName } : {}),
    readySummary: resolveReadySummary(profile, dashboard),
    roleNames: [...profile.roleNames],
  };
}

function mapMatch(
  match: HomeDashboardV1['recentMatches'][number],
  unreadCount: number,
): MatchedSet {
  const kind = mapMatchKind(match.kind);
  const status = mapMatchStatus(match.status);

  return {
    actionLabel:
      match.status === 'closed'
        ? 'Xem lại'
        : match.kind === 'team_rank'
          ? 'Vào lobby'
          : 'Vào set',
    ...(match.matchedPlayer.avatarUrl
      ? { avatarUrl: match.matchedPlayer.avatarUrl }
      : {}),
    ...(match.conversationId ? { conversationId: match.conversationId } : {}),
    createdAt: match.createdAt,
    heroNames: [],
    id: match.matchId,
    kind,
    meta: matchMeta(match.status),
    name: match.matchedPlayer.displayName,
    playerId: match.matchedPlayer.playerId,
    profileId: match.matchedPlayer.profileId,
    roleNames: [],
    status,
    subtitle: `${kind} · ${matchStatusLabel(match.status)}`,
    unreadCount,
  };
}

function mapMatchKind(kind: HomeMatchKindV1): MatchedSet['kind'] {
  switch (kind) {
    case 'normal':
      return 'Normal';
    case 'rank':
      return 'Rank';
    case 'set_love':
      return 'Set Love';
    case 'soulmate':
      return 'Tri kỉ';
    case 'team_rank':
      return 'Team Rank';
  }
}

function mapMatchStatus(status: HomeMatchStatusV1): MatchedSetStatus {
  switch (status) {
    case 'conversation_pending':
      return 'idle';
    case 'conversation_ready':
      return 'ready';
    case 'closed':
      return 'offline';
  }
}

function matchMeta(status: HomeMatchStatusV1) {
  switch (status) {
    case 'conversation_pending':
      return 'Đang tạo cuộc trò chuyện';
    case 'conversation_ready':
      return 'Sẵn sàng trò chuyện';
    case 'closed':
      return 'Kết nối đã đóng';
  }
}

function matchStatusLabel(status: HomeMatchStatusV1) {
  switch (status) {
    case 'conversation_pending':
      return 'Đang kết nối';
    case 'conversation_ready':
      return 'Đã có hội thoại';
    case 'closed':
      return 'Đã đóng';
  }
}

function resolveReadySummary(
  profile: HomeCurrentProfileV1,
  dashboard: HomeDashboardV1,
) {
  if (profile.onlineTimePreset) {
    return `Thường online ${profile.onlineTimePreset}`;
  }
  if (dashboard.activeMatchIntent?.lifecycle === 'active') {
    return `Đang sẵn sàng · ${dashboard.activeMatchIntent.mode}`;
  }
  switch (dashboard.playerLifecycle.state) {
    case 'active':
      return 'Hồ sơ đang hoạt động';
    case 'onboarding':
      return 'Đang hoàn tất hồ sơ';
    case 'registered':
      return 'Cần bắt đầu hồ sơ';
    case 'suspended':
      return 'Tài khoản đang tạm ngưng';
    case 'deleting':
      return 'Tài khoản đang được xóa';
    case 'deleted':
      return 'Tài khoản đã bị xóa';
  }
}

function avatarUrlFromSession(session: AuthSession) {
  const metadata = session.user.user_metadata;
  const candidates = [
    metadata?.avatar_url,
    metadata?.picture,
    metadata?.picture_url,
  ];
  return candidates.find(
    (value): value is string =>
      typeof value === 'string' && Boolean(value.trim()),
  );
}

function mediaUrl(assetId: string | null) {
  if (!assetId) return undefined;
  try {
    return new URL(
      `media/${encodeURIComponent(assetId)}`,
      ensureTrailingSlash(env.EXPO_PUBLIC_MEDIA_BASE_URL),
    ).toString();
  } catch {
    return undefined;
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}
