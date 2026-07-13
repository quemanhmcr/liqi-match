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
  recoverInterruptedOnboardingMediaQueue,
  replaceOnboardingMediaSlotItem,
} from '../model/onboarding-media-queue';
import {
  clearActivePersistedOnboardingDraft,
  createEmptyOnboardingDraft,
  hydratePersistedOnboardingDraft,
  legacyOnboardingDraftStorageKey,
  onboardingDraftStorageKey,
  savePersistedOnboardingStep,
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

  it('hydrates a canonical unanswered draft without product defaults', async () => {
    await hydratePersistedOnboardingDraft('account-a');

    expect(usePersistedOnboardingDraftStore.getState().envelope).toEqual(
      expect.objectContaining({
        accountId: 'account-a',
        currentStep: 'profile_setup',
        data: {
          profile: expect.objectContaining({
            favoriteHeroes: [],
            laneSelection: null,
            profileBasics: {
              displayName: '',
              gameHandle: null,
              genderId: null,
            },
            rankId: null,
            recurringAvailability: null,
            timezone: null,
          }),
        },
        status: 'not_started',
      }),
    );
  });

  it('isolates canonical profile drafts by authenticated account', async () => {
    await hydratePersistedOnboardingDraft('account-a');
    await savePersistedOnboardingStep({ rankId: 'diamond' }, 'lane');

    await hydratePersistedOnboardingDraft('account-b');
    expect(
      usePersistedOnboardingDraftStore.getState().envelope?.data.profile.rankId,
    ).toBeNull();
    await savePersistedOnboardingStep(
      { laneSelection: { primary: 'support', secondary: null } },
      'hero_selection',
    );

    await hydratePersistedOnboardingDraft('account-a');
    const profile =
      usePersistedOnboardingDraftStore.getState().envelope?.data.profile;
    expect(profile?.rankId).toBe('diamond');
    expect(profile?.laneSelection).toBeNull();
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
        data: {
          profile: {
            ...createEmptyOnboardingDraft('account-a').data.profile,
            rankId: 'gold',
          },
        },
      }),
    );
    await hydrateA;

    const state = usePersistedOnboardingDraftStore.getState();
    expect(state.accountId).toBe('account-b');
    expect(state.envelope?.accountId).toBe('account-b');
    expect(state.envelope?.data.profile.rankId).toBeNull();
  });

  it('serializes concurrent canonical profile writes', async () => {
    await hydratePersistedOnboardingDraft('account-a');

    const rankWrite = savePersistedOnboardingStep({ rankId: 'gold' }, 'lane');
    const laneWrite = savePersistedOnboardingStep(
      { laneSelection: { primary: 'mid', secondary: null } },
      'hero_selection',
    );
    await Promise.all([rankWrite, laneWrite]);

    expect(
      usePersistedOnboardingDraftStore.getState().envelope?.data.profile,
    ).toEqual(
      expect.objectContaining({
        laneSelection: { primary: 'mid', secondary: null },
        rankId: 'gold',
      }),
    );
  });

  it('rejects a queued write after the authenticated account changes', async () => {
    await hydratePersistedOnboardingDraft('account-a');
    let releaseFirstWrite: () => void = () => undefined;
    let signalFirstWriteStarted: () => void = () => undefined;
    const firstWritePending = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const firstWriteStarted = new Promise<void>((resolve) => {
      signalFirstWriteStarted = resolve;
    });
    let writeCount = 0;
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockImplementation(async (key, value) => {
        writeCount += 1;
        if (writeCount === 1) {
          signalFirstWriteStarted();
          await firstWritePending;
        }
        storage.set(key, value);
      });

    const firstWrite = savePersistedOnboardingStep({ rankId: 'gold' }, 'lane');
    const staleWrite = savePersistedOnboardingStep(
      { laneSelection: { primary: 'mid', secondary: null } },
      'hero_selection',
    );
    const staleWriteExpectation = expect(staleWrite).rejects.toThrow(
      'Tài khoản đã thay đổi',
    );
    await firstWriteStarted;
    clearActivePersistedOnboardingDraft();
    const hydrateB = hydratePersistedOnboardingDraft('account-b');
    releaseFirstWrite();

    await firstWrite;
    await staleWriteExpectation;
    await hydrateB;

    const state = usePersistedOnboardingDraftStore.getState();
    expect(state.accountId).toBe('account-b');
    expect(state.envelope?.data.profile.rankId).toBeNull();
  });

  it('does not expose an unpersisted canonical update when storage fails', async () => {
    await hydratePersistedOnboardingDraft('account-a');
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(
      savePersistedOnboardingStep({ rankId: 'master' }, 'lane'),
    ).rejects.toThrow('disk full');

    const state = usePersistedOnboardingDraftStore.getState();
    expect(state.envelope?.data.profile.rankId).toBeNull();
    expect(state.persistenceError).toBe('disk full');
  });

  it('migrates v1 profile data to v2 and downgrades legacy completion safely', async () => {
    const legacyKey = legacyOnboardingDraftStorageKey('account-a');
    storage.set(
      legacyKey,
      JSON.stringify({
        accountId: 'account-a',
        currentStep: 'profile_media',
        data: {
          habits: {
            comeback_response: 'Theo quyết định chung của đội',
            communication_channels: ['Voice khi cần'],
            decision_style: 'Cùng trao đổi trước khi quyết định',
            feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
            loss_response: 'Nghỉ 5-15 phút',
            online_time_presets: ['Tối'],
            seriousness: 'Cân bằng',
            session_length: '3-5 trận',
            strategy_styles: ['Ưu tiên kiểm soát mục tiêu'],
            team_atmospheres: ['Nghiêm túc nhưng tôn trọng'],
            team_goals: ['Leo rank nghiêm túc'],
          },
          heroIds: ['edras', 'goverra', 'heino'],
          laneIds: ['jungle'],
          profileBasics: { displayName: 'Liqi Pro', gender: 'hidden' },
          rankId: 'master',
        },
        status: 'completed',
        updatedAt: '2026-07-13T00:00:00.000Z',
        version: 1,
      }),
    );

    await hydratePersistedOnboardingDraft('account-a');

    const state = usePersistedOnboardingDraftStore.getState();
    expect(state.envelope?.version).toBe(2);
    expect(state.envelope?.status).toBe('in_progress');
    expect(state.envelope?.data.profile).toEqual(
      expect.objectContaining({
        favoriteHeroes: [
          { heroId: 'edras', priority: 1 },
          { heroId: 'goverra', priority: 2 },
          { heroId: 'heino', priority: 3 },
        ],
        laneSelection: { primary: 'jungle', secondary: null },
        profileBasics: {
          displayName: 'Liqi Pro',
          gameHandle: null,
          genderId: 'hidden',
        },
        rankId: 'master',
      }),
    );
    expect(state.migrationIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'legacy_game_handle_missing',
        'legacy_completed_status_downgraded',
      ]),
    );
    expect(storage.has(legacyKey)).toBe(false);
    expect(storage.has(onboardingDraftStorageKey('account-a'))).toBe(true);
  });

  it('recovers an interrupted upload as a resumable item error', async () => {
    storage.set(
      onboardingDraftStorageKey('account-a'),
      JSON.stringify({
        ...createEmptyOnboardingDraft('account-a'),
        data: {
          profile: createEmptyOnboardingDraft('account-a').data.profile,
          mediaQueue: [
            {
              localId: 'avatar:0:pending',
              localUri: 'file:///avatar.jpg',
              position: 0,
              slot: 'avatar',
              status: 'uploading',
            },
          ],
        },
        status: 'media_pending',
      }),
    );

    await hydratePersistedOnboardingDraft('account-a');
    await recoverInterruptedOnboardingMediaQueue();

    expect(
      usePersistedOnboardingDraftStore.getState().envelope?.data
        .mediaQueue?.[0],
    ).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('bị gián đoạn'),
        position: 0,
        status: 'error',
      }),
    );
  });

  it('keeps stable wall positions and canonical media summary in sync', async () => {
    await hydratePersistedOnboardingDraft('account-a');
    await replaceOnboardingMediaSlotItem({
      localId: 'wall:2:first',
      localUri: 'file:///wall-2.jpg',
      position: 2,
      slot: 'wall',
      status: 'selected',
    });
    await replaceOnboardingMediaSlotItem({
      localId: 'wall:0:first',
      localUri: 'file:///wall-0.jpg',
      position: 0,
      slot: 'wall',
      status: 'selected',
    });
    await replaceOnboardingMediaSlotItem({
      localId: 'wall:2:replacement',
      localUri: 'file:///wall-2-new.jpg',
      position: 2,
      slot: 'wall',
      status: 'selected',
    });

    const data = usePersistedOnboardingDraftStore.getState().envelope?.data;
    expect(
      data?.mediaQueue?.map((item) => [item.position, item.localId]),
    ).toEqual([
      [0, 'wall:0:first'],
      [2, 'wall:2:replacement'],
    ]);
    expect(data?.profile.mediaSelection.wallPositions).toEqual([0, 2]);
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
