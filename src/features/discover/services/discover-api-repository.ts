import type { AuthSession } from '@/shared/auth/auth-service';

import {
  DiscoverOverviewResponseSchema,
  DiscoverPlayersResponseSchema,
  DiscoverServiceError,
  DiscoverSetsResponseSchema,
  DiscoverVibesResponseSchema,
  InvitePlayerToSetCommandSchema,
  PlayerInviteReceiptSchema,
  RequestSetJoinCommandSchema,
  SetJoinRequestReceiptSchema,
  type CanonicalDiscoverOverviewParams,
  type CanonicalDiscoverPlayerListParams,
  type CanonicalDiscoverSetListParams,
  type CanonicalDiscoverVibeListParams,
  type InvitePlayerToSetCommand,
  type RequestSetJoinCommand,
} from '../contracts/discover-contracts';
import type {
  DiscoverRepository,
  DiscoverRequestContext,
} from './discover-repository';

export const discoverApiRoutes = {
  invitePlayer: (setId: string) =>
    `/v1/discover/sets/${encodeURIComponent(setId)}/invites`,
  joinSet: (setId: string) =>
    `/v1/discover/sets/${encodeURIComponent(setId)}/join-requests`,
  overview: '/v1/discover/overview',
  players: '/v1/discover/player-recommendations',
  sets: '/v1/discover/sets',
  vibes: '/v1/discover/vibes',
} as const;

export type DiscoverApiRequest = {
  body?: unknown;
  headers?: Record<string, string>;
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | string[] | undefined>;
  session: AuthSession | null;
};

export interface DiscoverApiTransport {
  request(request: DiscoverApiRequest): Promise<unknown>;
}

export class ApiDiscoverRepository implements DiscoverRepository {
  constructor(private readonly transport: DiscoverApiTransport) {}

  async getOverview(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverOverviewParams,
  ) {
    return parseResponse(
      DiscoverOverviewResponseSchema,
      await this.transport.request({
        method: 'GET',
        path: discoverApiRoutes.overview,
        query: overviewQuery(context, params),
        session: context.session,
      }),
    );
  }

  async listVibes(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverVibeListParams,
  ) {
    return parseResponse(
      DiscoverVibesResponseSchema,
      await this.transport.request({
        method: 'GET',
        path: discoverApiRoutes.vibes,
        query: listQuery(context, params),
        session: context.session,
      }),
    );
  }

  async listSets(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverSetListParams,
  ) {
    return parseResponse(
      DiscoverSetsResponseSchema,
      await this.transport.request({
        method: 'GET',
        path: discoverApiRoutes.sets,
        query: listQuery(context, params),
        session: context.session,
      }),
    );
  }

  async listPlayers(
    context: DiscoverRequestContext,
    params: CanonicalDiscoverPlayerListParams,
  ) {
    return parseResponse(
      DiscoverPlayersResponseSchema,
      await this.transport.request({
        method: 'GET',
        path: discoverApiRoutes.players,
        query: listQuery(context, params),
        session: context.session,
      }),
    );
  }

  async requestSetJoin(
    context: DiscoverRequestContext,
    command: RequestSetJoinCommand,
  ) {
    const canonical = RequestSetJoinCommandSchema.parse(command);
    return parseResponse(
      SetJoinRequestReceiptSchema,
      await this.transport.request({
        body: canonical,
        headers: { 'idempotency-key': canonical.idempotencyKey },
        method: 'POST',
        path: discoverApiRoutes.joinSet(canonical.setId),
        session: context.session,
      }),
    );
  }

  async invitePlayerToSet(
    context: DiscoverRequestContext,
    command: InvitePlayerToSetCommand,
  ) {
    const canonical = InvitePlayerToSetCommandSchema.parse(command);
    return parseResponse(
      PlayerInviteReceiptSchema,
      await this.transport.request({
        body: canonical,
        headers: { 'idempotency-key': canonical.idempotencyKey },
        method: 'POST',
        path: discoverApiRoutes.invitePlayer(canonical.setId),
        session: context.session,
      }),
    );
  }
}

function overviewQuery(
  context: DiscoverRequestContext,
  params: CanonicalDiscoverOverviewParams,
) {
  return {
    facetId: params.facetIds,
    locale: context.locale,
    previewLimit: String(params.previewLimit),
    query: optional(params.query),
    timezone: context.timezone,
  };
}

function listQuery(
  context: DiscoverRequestContext,
  params:
    | CanonicalDiscoverPlayerListParams
    | CanonicalDiscoverSetListParams
    | CanonicalDiscoverVibeListParams,
) {
  return {
    cursor: params.cursor,
    facetId: params.facetIds,
    limit: String(params.limit),
    locale: context.locale,
    query: optional(params.query),
    sort: params.sort,
    timezone: context.timezone,
  };
}

function optional(value: string) {
  return value ? value : undefined;
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
