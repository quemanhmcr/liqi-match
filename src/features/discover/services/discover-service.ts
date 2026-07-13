import type { AssetResolver } from '@/entities/media-asset';

import {
  DiscoverOverviewParamsSchema,
  DiscoverPlayerListParamsSchema,
  DiscoverSetListParamsSchema,
  DiscoverVibeListParamsSchema,
  InvitePlayerToSetCommandSchema,
  RequestSetJoinCommandSchema,
  type DiscoverOverviewParams,
  type DiscoverPlayerListParams,
  type DiscoverSetListParams,
  type DiscoverVibeListParams,
  type InvitePlayerToSetCommand,
  type RequestSetJoinCommand,
} from '../contracts/discover-contracts';
import {
  presentOverview,
  presentPlayer,
  presentSet,
  presentVibe,
} from '../model/discover-presenters';
import type {
  DiscoverRepository,
  DiscoverRequestContext,
} from './discover-repository';

export function canonicalizeOverviewParams(params: DiscoverOverviewParams) {
  const parsed = DiscoverOverviewParamsSchema.parse(params);
  return {
    ...parsed,
    facetIds: [...parsed.facetIds].sort(),
    query: parsed.query.trim(),
  };
}

export function canonicalizeVibeParams(params: DiscoverVibeListParams) {
  const parsed = DiscoverVibeListParamsSchema.parse(params);
  return {
    ...parsed,
    facetIds: [...parsed.facetIds].sort(),
    query: parsed.query.trim(),
  };
}

export function canonicalizeSetParams(params: DiscoverSetListParams) {
  const parsed = DiscoverSetListParamsSchema.parse(params);
  return {
    ...parsed,
    facetIds: [...parsed.facetIds].sort(),
    query: parsed.query.trim(),
  };
}

export function canonicalizePlayerParams(params: DiscoverPlayerListParams) {
  const parsed = DiscoverPlayerListParamsSchema.parse(params);
  return {
    ...parsed,
    facetIds: [...parsed.facetIds].sort(),
    query: parsed.query.trim(),
  };
}

export async function fetchDiscoverOverview(
  repository: DiscoverRepository,
  assetResolver: AssetResolver,
  context: DiscoverRequestContext,
  params: DiscoverOverviewParams,
) {
  const response = await repository.getOverview(
    context,
    canonicalizeOverviewParams(params),
  );
  return presentOverview(
    response.data,
    response.meta.generatedAt,
    assetResolver,
  );
}

export async function fetchDiscoverVibes(
  repository: DiscoverRepository,
  assetResolver: AssetResolver,
  context: DiscoverRequestContext,
  params: DiscoverVibeListParams,
) {
  const response = await repository.listVibes(
    context,
    canonicalizeVibeParams(params),
  );
  return {
    ...response.data,
    items: response.data.items.map((vibe) => presentVibe(vibe, assetResolver)),
  };
}

export async function fetchDiscoverSets(
  repository: DiscoverRepository,
  assetResolver: AssetResolver,
  context: DiscoverRequestContext,
  params: DiscoverSetListParams,
) {
  const response = await repository.listSets(
    context,
    canonicalizeSetParams(params),
  );
  return {
    ...response.data,
    items: response.data.items.map((item) =>
      presentSet(item, response.meta.generatedAt, assetResolver),
    ),
  };
}

export async function fetchDiscoverPlayers(
  repository: DiscoverRepository,
  assetResolver: AssetResolver,
  context: DiscoverRequestContext,
  params: DiscoverPlayerListParams,
) {
  const response = await repository.listPlayers(
    context,
    canonicalizePlayerParams(params),
  );
  return {
    ...response.data,
    items: response.data.items.map((player) =>
      presentPlayer(player, assetResolver),
    ),
  };
}

export function requestDiscoverSetJoin(
  repository: DiscoverRepository,
  context: DiscoverRequestContext,
  command: RequestSetJoinCommand,
) {
  return repository.requestSetJoin(
    context,
    RequestSetJoinCommandSchema.parse(command),
  );
}

export function inviteDiscoverPlayer(
  repository: DiscoverRepository,
  context: DiscoverRequestContext,
  command: InvitePlayerToSetCommand,
) {
  return repository.invitePlayerToSet(
    context,
    InvitePlayerToSetCommandSchema.parse(command),
  );
}
