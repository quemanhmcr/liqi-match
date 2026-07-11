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
import { MockDiscoverRepository } from './discover-mock-repository';
import type { DiscoverRequestContext } from './discover-repository';

export const mockDiscoverRepository = new MockDiscoverRepository();
const repository = mockDiscoverRepository;

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
  context: DiscoverRequestContext,
  params: DiscoverOverviewParams,
) {
  const response = await repository.getOverview(
    context,
    canonicalizeOverviewParams(params),
  );
  return presentOverview(response.data, response.meta.generatedAt);
}

export function getInitialDiscoverOverview(
  context: DiscoverRequestContext,
  params: DiscoverOverviewParams,
) {
  const response = mockDiscoverRepository.peekOverview(
    context,
    canonicalizeOverviewParams(params),
  );
  return presentOverview(response.data, response.meta.generatedAt);
}

export async function fetchDiscoverVibes(
  context: DiscoverRequestContext,
  params: DiscoverVibeListParams,
) {
  const response = await repository.listVibes(
    context,
    canonicalizeVibeParams(params),
  );
  return {
    ...response.data,
    items: response.data.items.map(presentVibe),
  };
}

export function getInitialDiscoverVibes(
  context: DiscoverRequestContext,
  params: DiscoverVibeListParams,
) {
  const response = mockDiscoverRepository.peekVibes(
    context,
    canonicalizeVibeParams(params),
  );
  return { ...response.data, items: response.data.items.map(presentVibe) };
}

export async function fetchDiscoverSets(
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
      presentSet(item, response.meta.generatedAt),
    ),
  };
}

export function getInitialDiscoverSets(
  context: DiscoverRequestContext,
  params: DiscoverSetListParams,
) {
  const response = mockDiscoverRepository.peekSets(
    context,
    canonicalizeSetParams(params),
  );
  return {
    ...response.data,
    items: response.data.items.map((item) =>
      presentSet(item, response.meta.generatedAt),
    ),
  };
}

export async function fetchDiscoverPlayers(
  context: DiscoverRequestContext,
  params: DiscoverPlayerListParams,
) {
  const response = await repository.listPlayers(
    context,
    canonicalizePlayerParams(params),
  );
  return { ...response.data, items: response.data.items.map(presentPlayer) };
}

export function getInitialDiscoverPlayers(
  context: DiscoverRequestContext,
  params: DiscoverPlayerListParams,
) {
  const response = mockDiscoverRepository.peekPlayers(
    context,
    canonicalizePlayerParams(params),
  );
  return { ...response.data, items: response.data.items.map(presentPlayer) };
}

export function requestDiscoverSetJoin(
  context: DiscoverRequestContext,
  command: RequestSetJoinCommand,
) {
  return repository.requestSetJoin(
    context,
    RequestSetJoinCommandSchema.parse(command),
  );
}

export function inviteDiscoverPlayer(
  context: DiscoverRequestContext,
  command: InvitePlayerToSetCommand,
) {
  return repository.invitePlayerToSet(
    context,
    InvitePlayerToSetCommandSchema.parse(command),
  );
}

export function resetMockDiscoverData() {
  mockDiscoverRepository.reset();
}
