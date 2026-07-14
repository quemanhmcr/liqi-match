import {
  DiscoveryCandidatePageV1Schema,
  type DiscoveryCandidateV1,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  discoverContractVersion,
  DiscoverOverviewResponseSchema,
  DiscoverPlayersResponseSchema,
  DiscoverServiceError,
  type CanonicalDiscoverOverviewParams,
  type CanonicalDiscoverPlayerListParams,
  type CanonicalDiscoverSetListParams,
  type CanonicalDiscoverVibeListParams,
  type InvitePlayerToSetCommand,
  type RequestSetJoinCommand,
} from '../contracts/discover-contracts';
import { createAuthoritativePlayerOverview } from './discover-authoritative-overview';
import type {
  DiscoverRepository,
  DiscoverRequestContext,
} from './discover-repository';

export type DiscoverRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) => Promise<unknown>;

export class ApiDiscoverRepository implements DiscoverRepository {
  constructor(private readonly rpc: DiscoverRpcTransport = callRpc) {}

  async getOverview(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ) {
    const players = await this.listPlayers(context, {
      facetIds: params.facetIds,
      limit: params.previewLimit,
      query: params.query,
      sort: 'best_match',
    });

    return parseResponse(
      DiscoverOverviewResponseSchema,
      createAuthoritativePlayerOverview({
        generatedAt: players.meta.generatedAt,
        players: players.data.items,
        requestId: players.meta.requestId,
      }),
    );
  }

  async listVibes(
    _context: DiscoverRequestContext,
    _params: CanonicalDiscoverVibeListParams,
  ): Promise<never> {
    throw legacyCapabilityError(
      'Vibe discovery is deferred beyond Production Match Loop v1.',
    );
  }

  async listSets(
    _context: DiscoverRequestContext,
    _params: CanonicalDiscoverSetListParams,
  ): Promise<never> {
    throw legacyCapabilityError(
      'Use the authoritative MatchSetRepository for Set discovery.',
    );
  }

  async listPlayers(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ) {
    if (!context.session) {
      throw new DiscoverServiceError(
        'unauthenticated',
        'Authentication is required for authoritative Discovery.',
      );
    }
    if (
      params.facetIds.length > 0 ||
      params.query.length > 0 ||
      params.sort !== 'best_match'
    ) {
      throw new DiscoverServiceError(
        'validation_failed',
        'Authoritative Discovery v1 supports best-match pagination without advanced filters.',
      );
    }

    const page = parseResponse(
      DiscoveryCandidatePageV1Schema,
      await this.rpc('list_discovery_candidates_v1', context.session, {
        p_cursor: params.cursor ?? null,
        p_limit: params.limit,
      }),
    );

    return parseResponse(DiscoverPlayersResponseSchema, {
      contractVersion: discoverContractVersion,
      data: {
        items: page.items.map((candidate) =>
          candidateToRecommendation(candidate, page.snapshot.intentVersion),
        ),
        pageInfo: {
          hasNextPage: page.nextCursor !== null,
          nextCursor: page.nextCursor,
        },
      },
      meta: {
        generatedAt: page.snapshot.createdAt,
        requestId: page.snapshot.snapshotId,
      },
    });
  }

  async requestSetJoin(
    _context: DiscoverRequestContext,
    _command: RequestSetJoinCommand,
  ): Promise<never> {
    throw legacyCapabilityError(
      'Use the authoritative MatchSetRepository join command.',
    );
  }

  async invitePlayerToSet(
    _context: DiscoverRequestContext,
    _command: InvitePlayerToSetCommand,
  ): Promise<never> {
    throw legacyCapabilityError(
      'Use the authoritative MatchSetRepository invite command.',
    );
  }
}

function legacyCapabilityError(message: string) {
  return new DiscoverServiceError('validation_failed', message);
}

function parseResponse<T>(
  schema: { parse: (value: unknown) => T },
  payload: unknown,
): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    throw new DiscoverServiceError(
      'contract_violation',
      error instanceof Error ? error.message : 'Invalid Discover API response',
    );
  }
}

async function callRpc(
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) {
  return await supabaseRest<unknown>(`rpc/${functionName}`, {
    body,
    method: 'POST',
    session,
  });
}

function candidateToRecommendation(
  candidate: DiscoveryCandidateV1,
  intentVersion: number,
) {
  const avatarUrl = mediaUrl(candidate.profileSummary.avatarAssetId);
  return {
    avatar: avatarUrl
      ? {
          id: candidate.profileSummary.avatarAssetId,
          kind: 'remote' as const,
          url: avatarUrl,
        }
      : {
          assetKey: 'discover.profile.neutral',
          kind: 'fixture' as const,
        },
    capabilities: {
      canLike: candidate.capabilities.canLike,
      canMessage: false,
      canPass: candidate.capabilities.canPass,
      canViewProfile: true,
      invite: { state: 'unavailable' as const },
    },
    displayName: candidate.profileSummary.displayName,
    facetIds: [],
    intentVersion,
    matchReasons: candidate.recommendationContext.reasonCodes.map((code) => ({
      code,
      label: reasonLabel(code),
    })),
    matchScore: candidate.recommendationContext.score ?? 0,
    onlineStatus: 'hidden' as const,
    ...(candidate.profileSummary.primaryRole
      ? {
          primaryRole: {
            id: candidate.profileSummary.primaryRole.id,
            name: candidate.profileSummary.primaryRole.name,
          },
        }
      : undefined),
    playerId: candidate.playerId,
    profileId: candidate.profileSummary.profileId,
    profileVersion: candidate.profileSummary.profileVersion,
    ...(candidate.profileSummary.rank
      ? {
          rank: {
            id: candidate.profileSummary.rank.id,
            name: candidate.profileSummary.rank.name,
          },
        }
      : undefined),
    relationshipState: candidate.relationshipState,
  };
}

function mediaUrl(assetId: string | null | undefined) {
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

function reasonLabel(code: string) {
  return (
    {
      active_now: 'Đang sẵn sàng',
      intent_kind_overlap: 'Cùng mục tiêu',
      mode_overlap: 'Cùng chế độ',
      party_format_overlap: 'Cùng đội hình',
      previous_like: 'Bạn đã thích',
    }[code] ?? code
  );
}
