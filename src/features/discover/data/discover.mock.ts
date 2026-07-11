/**
 * Compatibility surface for existing tests while Discover migrates to the
 * contract-first repository. Product screens/components must not import here.
 */
import { previewDiscoverData } from './discover.preview';

export const discoverAllProfileCards = previewDiscoverData.allProfiles;
export const discoverAllSetCards = previewDiscoverData.allSets;
export const discoverAllVibeCards = previewDiscoverData.allVibes;
export const discoverFilterChips = previewDiscoverData.filterChips;
export const discoverMetricCards = previewDiscoverData.metrics;
export const discoverProfileCards = previewDiscoverData.overview.profiles;
export const discoverSetCards = previewDiscoverData.overview.sets;
export const discoverVibeCards = previewDiscoverData.overview.vibes;

export type {
  DiscoverFilterId,
  DiscoverMetricCard,
  DiscoverProfileCard,
  DiscoverSetCard,
  DiscoverVibeCard,
} from '../model/discover-domain';
