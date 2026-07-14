import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import type {
  MediaStagingItem,
  OnboardingDraft,
} from '@/entities/player-profile';

import {
  clearActivePersistedOnboardingDraft,
  onboardingDraftStorageKey,
  ONBOARDING_DRAFT_VERSION,
  usePersistedOnboardingDraftStore,
  type OnboardingDraftEnvelope,
} from '@/features/onboarding';
import {
  createTestAuthSession,
  renderWithProviders,
  testAccountId,
  testAuthSession,
  testOnboardingAuthSession,
} from '@/test/render-with-providers';

jest.mock('expo-router', () => ({
  __esModule: true,
  Redirect: ({ href }: { href: string }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const Native =
      jest.requireActual<typeof import('react-native')>('react-native');
    return ReactModule.createElement(
      Native.Text,
      { accessibilityLabel: 'redirect-target' },
      String(href),
    );
  },
  usePathname: jest.fn(() => '/home'),
}));

const { RouteAccessGate } =
  jest.requireActual<typeof import('../RouteAccessGate')>('../RouteAccessGate');
const mockExpoRouter = jest.requireMock('expo-router') as {
  usePathname: ReturnType<typeof jest.fn<() => string>>;
};

describe('RouteAccessGate authoritative lifecycle integration', () => {
  beforeEach(async () => {
    await act(async () => {
      clearActivePersistedOnboardingDraft();
    });
    mockExpoRouter.usePathname.mockReset();
    mockExpoRouter.usePathname.mockReturnValue('/home');
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
  });

  afterEach(async () => {
    await act(async () => {
      clearActivePersistedOnboardingDraft();
    });
    jest.restoreAllMocks();
  });

  it('sends an authoritative onboarding player to the first local resume step', async () => {
    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
      { session: testOnboardingAuthSession },
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-setup',
      );
    });
  });

  it('blocks an onboarding deep link when local prerequisites are unanswered', async () => {
    mockExpoRouter.usePathname.mockReturnValue('/profile-media');
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(
      JSON.stringify(
        envelope({
          data: { profile: { ...completeProfile(), rankId: null } },
        }),
      ),
    );

    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="onboarding">
        <Text>Media content</Text>
      </RouteAccessGate>,
      { session: testOnboardingAuthSession },
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe('/rank');
    });
  });

  it('keeps a media-pending onboarding player at the final resume step', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key) => {
      if (key !== onboardingDraftStorageKey(testAccountId)) return null;
      return JSON.stringify(
        envelope({
          data: {
            ...completeData(),
            mediaQueue: [
              mediaItem({
                failure: {
                  code: 'upload_failed',
                  message: 'R2 unavailable',
                },
                status: 'failed',
              }),
            ],
          },
          status: 'media_pending',
        }),
      );
    });

    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
      { session: testOnboardingAuthSession },
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-media',
      );
    });
  });

  it('does not grant Home from a stale local completed marker', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockResolvedValue(JSON.stringify(envelope({ status: 'completed' })));

    const { getByLabelText, queryByText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
      { session: testOnboardingAuthSession },
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-media',
      );
    });
    expect(queryByText('App content')).toBeNull();
  });

  it('allows an authoritative active player without hydrating local onboarding state', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    const { getByText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
      { session: testAuthSession },
    );

    await waitFor(() => expect(getByText('App content')).toBeTruthy());
    expect(getItem).not.toHaveBeenCalled();
  });

  it('redirects an active player away from public auth routes', async () => {
    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="public">
        <Text>Login content</Text>
      </RouteAccessGate>,
      { session: testAuthSession },
    );

    expect(getByLabelText('redirect-target').props.children).toBe('/home');
  });

  const blockedCases: ['suspended' | 'deleting' | 'deleted', string][] = [
    ['suspended', 'Tài khoản đang bị tạm ngưng'],
    ['deleting', 'Đang xóa tài khoản'],
    ['deleted', 'Tài khoản đã được xóa'],
  ];

  it.each(blockedCases)(
    'fails closed for lifecycle %s',
    async (state, label) => {
      const { getByLabelText, queryByText } = await renderWithProviders(
        <RouteAccessGate area="app">
          <Text>App content</Text>
        </RouteAccessGate>,
        { session: createTestAuthSession({ lifecycleState: state }) },
      );

      expect(getByLabelText(label)).toBeTruthy();
      expect(queryByText('App content')).toBeNull();
    },
  );

  it('does not reuse another account local draft', async () => {
    await act(async () => {
      usePersistedOnboardingDraftStore.setState({
        accountId: testAccountId,
        envelope: envelope({ status: 'completed' }),
        hydration: 'ready',
        hydrationError: null,
        migrationIssues: [],
        persistenceError: null,
        source: 'persisted',
      });
    });
    const accountB = createTestAuthSession({
      accountId: '01000000-0000-4000-8000-000000000002',
      lifecycleState: 'onboarding',
      playerId: '20000000-0000-4000-8000-000000000002',
      profileId: '30000000-0000-4000-8000-000000000002',
      sessionId: '09000000-0000-4000-8000-000000000002',
    });

    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
      { session: accountB },
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-setup',
      );
    });
    expect(usePersistedOnboardingDraftStore.getState().accountId).toBe(
      accountB.user.id,
    );
  });
});

function mediaItem(patch: Partial<MediaStagingItem> = {}): MediaStagingItem {
  return {
    asset: {
      fileName: 'avatar.jpg',
      fileSize: 1024,
      height: 512,
      mimeType: 'image/jpeg',
      uri: 'file:///avatar.jpg',
      width: 512,
    },
    cleanup: {
      completedAt: null,
      failure: null,
      lastAttemptAt: null,
      requestedAt: null,
    },
    failure: null,
    localId: 'avatar:0:failed',
    persistedAt: '2026-07-13T00:00:00.000Z',
    position: 0,
    retry: {
      attemptCount: 1,
      lastAttemptAt: '2026-07-13T00:00:00.000Z',
      retryable: true,
    },
    slot: 'avatar',
    status: 'selected',
    uploadedAssetId: null,
    uploadedObjectKey: null,
    ...patch,
  };
}

function completeProfile(): OnboardingDraft {
  return {
    favoriteHeroes: [
      { heroId: 'edras', priority: 1 },
      { heroId: 'goverra', priority: 2 },
      { heroId: 'heino', priority: 3 },
    ],
    habits: {
      comebackResponseId: 'comeback.team-decision',
      communicationPreferenceIds: ['communication.voice-as-needed'],
      decisionStyleId: 'decision.discuss',
      feedbackStyleId: 'feedback.brief',
      lossResponseId: 'loss.short-break',
      seriousnessId: 'seriousness.balanced',
      sessionLengthId: 'session.three-five',
      strategyStyleIds: ['strategy.objectives'],
      teamAtmosphereIds: ['atmosphere.respectful'],
      teamGoalIds: ['goal.rank-climb'],
      timePreferenceIds: ['time.evening'],
    },
    laneSelection: { primary: 'jungle', secondary: null },
    localeId: 'vi-VN',
    matchIntent: null,
    mediaSelection: {
      avatarSelected: false,
      coverSelected: false,
      wallPositions: [],
    },
    profileBasics: {
      displayName: 'Liqi Pro',
      gameHandle: 'LiqiGame#123',
      genderId: 'hidden',
    },
    rankId: 'master',
    recurringAvailability: {
      slots: [{ dayOfWeek: 6, endMinute: 1440, startMinute: 1080 }],
      timezone: 'Asia/Ho_Chi_Minh',
    },
    timezone: 'Asia/Ho_Chi_Minh',
  };
}

function completeData(): OnboardingDraftEnvelope['data'] {
  return { profile: completeProfile() };
}

function envelope(
  input: Partial<
    Pick<OnboardingDraftEnvelope, 'accountId' | 'data' | 'status'>
  > = {},
): OnboardingDraftEnvelope {
  return {
    accountId: input.accountId ?? testAccountId,
    currentStep: 'profile_media',
    data: input.data ?? completeData(),
    status: input.status ?? 'in_progress',
    updatedAt: '2026-07-13T00:00:00.000Z',
    version: ONBOARDING_DRAFT_VERSION,
  };
}
