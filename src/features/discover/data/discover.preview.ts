import type { DiscoverRequestContext } from '../services/discover-repository';
import {
  getInitialDiscoverOverview,
  getInitialDiscoverPlayers,
  getInitialDiscoverSets,
  getInitialDiscoverVibes,
} from '../services/discover-service';

const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'preview',
};
const overview = getInitialDiscoverOverview(context, {
  facetIds: [],
  previewLimit: 3,
  query: '',
});

export const previewDiscoverData = {
  allProfiles: getInitialDiscoverPlayers(context, {
    facetIds: [],
    limit: 50,
    query: '',
    sort: 'best_match',
  }).items,
  allSets: getInitialDiscoverSets(context, {
    facetIds: [],
    limit: 50,
    query: '',
    sort: 'best_match',
  }).items,
  allVibes: getInitialDiscoverVibes(context, {
    facetIds: [],
    limit: 50,
    query: '',
    sort: 'popular',
  }).items,
  filterChips: overview.filterChips,
  metrics: overview.metrics,
  overview,
} as const;
