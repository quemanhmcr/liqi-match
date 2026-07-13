import { createGoldenWorldAssetResolver } from '@/entities/media-asset';

import {
  presentOverview,
  presentPlayer,
  presentSet,
  presentVibe,
} from '../model/discover-presenters';
import { MockDiscoverRepository } from '../services/discover-mock-repository';
import type { DiscoverRequestContext } from '../services/discover-repository';

const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'preview',
};
const repository = new MockDiscoverRepository();
const assetResolver = createGoldenWorldAssetResolver();
const overviewResponse = repository.peekOverview(context, {
  facetIds: [],
  previewLimit: 3,
  query: '',
});
const playerResponse = repository.peekPlayers(context, {
  cursor: undefined,
  facetIds: [],
  limit: 50,
  query: '',
  sort: 'best_match',
});
const setResponse = repository.peekSets(context, {
  cursor: undefined,
  facetIds: [],
  limit: 50,
  query: '',
  sort: 'best_match',
});
const vibeResponse = repository.peekVibes(context, {
  cursor: undefined,
  facetIds: [],
  limit: 50,
  query: '',
  sort: 'popular',
});
const overview = presentOverview(
  overviewResponse.data,
  overviewResponse.meta.generatedAt,
  assetResolver,
);

/** Test/Storybook compatibility data. Runtime screens use injected repositories. */
export const previewDiscoverData = {
  allProfiles: playerResponse.data.items.map((player) =>
    presentPlayer(player, assetResolver),
  ),
  allSets: setResponse.data.items.map((item) =>
    presentSet(item, setResponse.meta.generatedAt, assetResolver),
  ),
  allVibes: vibeResponse.data.items.map((vibe) =>
    presentVibe(vibe, assetResolver),
  ),
  filterChips: overview.filterChips,
  metrics: overview.metrics,
  overview,
} as const;
