import { beforeEach, describe, expect, it } from '@jest/globals';

import { resetDiscoverState, useDiscoverStore } from '../model/discover-store';
import { normalizeSearchText } from '../model/discover-search';

beforeEach(() => resetDiscoverState());

describe('Discover UI store', () => {
  it('keeps only local criteria and selection state', () => {
    expect(useDiscoverStore.getState()).toMatchObject({
      activeFilterIds: [],
      filtersExpanded: true,
      query: '',
      selectedProfileId: null,
      selectedSetId: null,
      selectedVibeId: null,
    });
    expect(useDiscoverStore.getState()).not.toHaveProperty('requestedSetIds');
    expect(useDiscoverStore.getState()).not.toHaveProperty('invitedProfileIds');
  });

  it('opens filters by default and reset restores the visible panel', () => {
    useDiscoverStore.getState().toggleFiltersExpanded();
    useDiscoverStore.getState().toggleFilter('rank');
    useDiscoverStore.getState().setQuery('duo');
    useDiscoverStore.getState().resetCriteria();

    expect(useDiscoverStore.getState()).toMatchObject({
      activeFilterIds: [],
      filtersExpanded: true,
      query: '',
    });
  });

  it('toggles filters, clears all via Tất cả and keeps query independent', () => {
    const state = useDiscoverStore.getState();
    state.toggleFilter('rank');
    state.toggleFilter('mic');
    state.setQuery('duo');

    expect(useDiscoverStore.getState().activeFilterIds).toEqual([
      'rank',
      'mic',
    ]);
    useDiscoverStore.getState().toggleFilter('rank');
    expect(useDiscoverStore.getState().activeFilterIds).toEqual(['mic']);
    useDiscoverStore.getState().toggleFilter('all');
    expect(useDiscoverStore.getState().activeFilterIds).toEqual([]);
    expect(useDiscoverStore.getState().query).toBe('duo');
    useDiscoverStore.getState().clearQuery();
    expect(useDiscoverStore.getState().query).toBe('');
  });

  it('tracks view selections locally without owning server mutation state', () => {
    const state = useDiscoverStore.getState();
    state.openSet('team-sao-bang');
    state.openProfile('minh-anh');
    state.selectVibe('late-night-rank');

    expect(useDiscoverStore.getState()).toMatchObject({
      selectedProfileId: 'minh-anh',
      selectedSetId: 'team-sao-bang',
      selectedVibeId: 'late-night-rank',
    });
    useDiscoverStore.getState().selectVibe('late-night-rank');
    expect(useDiscoverStore.getState().selectedVibeId).toBeNull();
  });

  it('normalizes Vietnamese text, punctuation and whitespace', () => {
    expect(normalizeSearchText('  Đường-Giữa  ')).toBe('duong giua');
    expect(normalizeSearchText('Duo Rừng + Trợ Thủ')).toBe('duo rung tro thu');
  });
});
