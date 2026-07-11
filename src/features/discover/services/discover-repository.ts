import type { AuthSession } from '@/shared/auth/auth-service';

import type {
  CanonicalDiscoverOverviewParams,
  CanonicalDiscoverPlayerListParams,
  CanonicalDiscoverSetListParams,
  CanonicalDiscoverVibeListParams,
  DiscoverOverviewData,
  DiscoverPage,
  DiscoverPlayerRecommendation,
  DiscoverResponse,
  DiscoverSet,
  DiscoverVibe,
  InvitePlayerToSetCommand,
  PlayerInviteReceipt,
  RequestSetJoinCommand,
  SetJoinRequestReceipt,
} from '../contracts/discover-contracts';

export type DiscoverRequestContext = {
  locale: string;
  session: AuthSession | null;
  timezone: string;
  viewerId: string;
};

export interface DiscoverRepository {
  getOverview(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ): Promise<DiscoverResponse<DiscoverOverviewData>>;
  invitePlayerToSet(
    context: DiscoverRequestContext,
    command: InvitePlayerToSetCommand,
  ): Promise<PlayerInviteReceipt>;
  listPlayers(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ): Promise<DiscoverResponse<DiscoverPage<DiscoverPlayerRecommendation>>>;
  listSets(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverSetListParams,
  ): Promise<DiscoverResponse<DiscoverPage<DiscoverSet>>>;
  listVibes(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverVibeListParams,
  ): Promise<DiscoverResponse<DiscoverPage<DiscoverVibe>>>;
  requestSetJoin(
    context: DiscoverRequestContext,
    command: RequestSetJoinCommand,
  ): Promise<SetJoinRequestReceipt>;
}
