import { create } from 'zustand';

import type { DiscoverFilterId } from './discover-domain';

export type DiscoverState = {
  activeFilterIds: DiscoverFilterId[];
  filtersExpanded: boolean;
  query: string;
  selectedProfileId: string | null;
  selectedSetId: string | null;
  selectedVibeId: string | null;
  clearQuery: () => void;
  openProfile: (profileId: string) => void;
  openSet: (setId: string) => void;
  reset: () => void;
  resetCriteria: () => void;
  selectVibe: (vibeId: string) => void;
  setQuery: (query: string) => void;
  toggleFilter: (filterId: DiscoverFilterId) => void;
  toggleFiltersExpanded: () => void;
};

const initialState = {
  activeFilterIds: [] as DiscoverFilterId[],
  filtersExpanded: true,
  query: '',
  selectedProfileId: null as string | null,
  selectedSetId: null as string | null,
  selectedVibeId: null as string | null,
};

export const useDiscoverStore = create<DiscoverState>((set) => ({
  ...initialState,
  clearQuery: () => set({ query: '' }),
  openProfile: (profileId) => set({ selectedProfileId: profileId }),
  openSet: (setId) => set({ selectedSetId: setId }),
  reset: () => set(initialState),
  resetCriteria: () =>
    set({ activeFilterIds: [], filtersExpanded: true, query: '' }),
  selectVibe: (vibeId) =>
    set((state) => ({
      selectedVibeId: state.selectedVibeId === vibeId ? null : vibeId,
    })),
  setQuery: (query) => set({ query }),
  toggleFilter: (filterId) =>
    set((state) => {
      if (filterId === 'all') return { activeFilterIds: [] };
      return {
        activeFilterIds: state.activeFilterIds.includes(filterId)
          ? state.activeFilterIds.filter((value) => value !== filterId)
          : [...state.activeFilterIds, filterId],
      };
    }),
  toggleFiltersExpanded: () =>
    set((state) => ({ filtersExpanded: !state.filtersExpanded })),
}));

export function resetDiscoverState() {
  useDiscoverStore.getState().reset();
}

export function countDiscoverResults(content: {
  profiles: readonly unknown[];
  sets: readonly unknown[];
  vibes: readonly unknown[];
}) {
  return content.profiles.length + content.sets.length + content.vibes.length;
}
