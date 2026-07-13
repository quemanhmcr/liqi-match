import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  clearActivePersistedOnboardingDraft,
  createEmptyOnboardingDraft,
  hydratePersistedOnboardingDraft,
  onboardingDraftStorageKey,
  patchPersistedOnboardingDraftData,
  usePersistedOnboardingDraftStore,
} from '../model/persisted-onboarding-draft';

describe('persisted onboarding draft infrastructure', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    clearActivePersistedOnboardingDraft();
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockImplementation(async (key) => storage.get(key) ?? null);
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockImplementation(async (key, value) => {
        storage.set(key, value);
      });
    jest.spyOn(AsyncStorage, 'removeItem').mockImplementation(async (key) => {
      storage.delete(key);
    });
  });

  afterEach(() => {
    clearActivePersistedOnboardingDraft();
    jest.restoreAllMocks();
  });

  it('hydrates a truly unanswered draft without synthetic defaults', async () => {
    await hydratePersistedOnboardingDraft('account-a');

    expect(usePersistedOnboardingDraftStore.getState().envelope).toEqual(
      expect.objectContaining({
        accountId: 'account-a',
        currentStep: 'profile_setup',
        data: {},
        status: 'not_started',
      }),
    );
  });

  it('isolates persisted drafts by authenticated account', async () => {
    await hydratePersistedOnboardingDraft('account-a');
    await patchPersistedOnboardingDraftData({ rankId: 'diamond' });

    await hydratePersistedOnboardingDraft('account-b');
    expect(
      usePersistedOnboardingDraftStore.getState().envelope?.data.rankId,
    ).toBeUndefined();
    await patchPersistedOnboardingDraftData({ laneIds: ['support'] });

    await hydratePersistedOnboardingDraft('account-a');
    expect(usePersistedOnboardingDraftStore.getState().envelope?.data).toEqual({
      rankId: 'diamond',
    });
  });

  it('ignores stale hydration after the authenticated account changes', async () => {
    let resolveAccountA: (value: string | null) => void = () => undefined;
    const delayedAccountA = new Promise<string | null>((resolve) => {
      resolveAccountA = resolve;
    });
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockImplementation((key) =>
        key === onboardingDraftStorageKey('account-a')
          ? delayedAccountA
          : Promise.resolve(null),
      );

    const hydrateA = hydratePersistedOnboardingDraft('account-a');
    await Promise.resolve();
    await hydratePersistedOnboardingDraft('account-b');
    resolveAccountA(
      JSON.stringify({
        ...createEmptyOnboardingDraft('account-a'),
        data: { rankId: 'gold' },
      }),
    );
    await hydrateA;

    const state = usePersistedOnboardingDraftStore.getState();
    expect(state.accountId).toBe('account-b');
    expect(state.envelope?.accountId).toBe('account-b');
    expect(state.envelope?.data.rankId).toBeUndefined();
  });

  it('serializes concurrent writes without losing an earlier patch', async () => {
    await hydratePersistedOnboardingDraft('account-a');

    const rankWrite = patchPersistedOnboardingDraftData({ rankId: 'gold' });
    const laneWrite = patchPersistedOnboardingDraftData({ laneIds: ['mid'] });
    await Promise.all([rankWrite, laneWrite]);

    expect(usePersistedOnboardingDraftStore.getState().envelope?.data).toEqual({
      laneIds: ['mid'],
      rankId: 'gold',
    });
  });

  it('does not expose an unpersisted update when storage fails', async () => {
    await hydratePersistedOnboardingDraft('account-a');
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(
      patchPersistedOnboardingDraftData({ rankId: 'master' }),
    ).rejects.toThrow('disk full');

    const state = usePersistedOnboardingDraftStore.getState();
    expect(state.envelope?.data.rankId).toBeUndefined();
    expect(state.persistenceError).toBe('disk full');
  });

  it('rejects a stored envelope belonging to another account', async () => {
    storage.set(
      onboardingDraftStorageKey('account-a'),
      JSON.stringify(createEmptyOnboardingDraft('account-b')),
    );

    await hydratePersistedOnboardingDraft('account-a');

    expect(usePersistedOnboardingDraftStore.getState().hydration).toBe('error');
    expect(usePersistedOnboardingDraftStore.getState().envelope).toBeNull();
  });
});
