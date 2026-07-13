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

import type { OnboardingDraft } from '@/entities/player-profile';

import {
  clearActivePersistedOnboardingDraft,
  onboardingDraftStorageKey,
  ONBOARDING_DRAFT_VERSION,
  usePersistedOnboardingDraftStore,
  type OnboardingDraftEnvelope,
} from '@/features/onboarding';
import {
  renderWithProviders,
  testAuthSession,
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
const testAccountId = '00000000-0000-0000-0000-000000000001';

describe('RouteAccessGate onboarding integration', () => {
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

  it('sends a new authenticated user to the first onboarding step', async () => {
    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-setup',
      );
    });
  });

  it('blocks a deep link to media when rank is still unanswered', async () => {
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
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe('/rank');
    });
  });

  it('keeps a core-complete user with media errors inside media_pending', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key) => {
      if (key !== onboardingDraftStorageKey(testAccountId)) return null;
      return JSON.stringify(
        envelope({
          data: {
            ...completeData(),
            mediaQueue: [
              {
                error: 'R2 unavailable',
                localId: 'avatar:0:failed',
                localUri: 'file:///avatar.jpg',
                position: 0,
                slot: 'avatar',
                status: 'error',
              },
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
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-media',
      );
    });
  });

  it('does not reuse a completed draft after the authenticated account changes', async () => {
    await act(async () => {
      usePersistedOnboardingDraftStore.setState({
        accountId: 'account-a',
        envelope: envelope({
          accountId: 'account-a',
          status: 'completed',
        }),
        hydration: 'ready',
        hydrationError: null,
        migrationIssues: [],
        persistenceError: null,
        source: 'persisted',
      });
    });
    const accountBSession = {
      ...testAuthSession,
      user: { ...testAuthSession.user, id: 'account-b' },
    };

    const { getByLabelText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
      { session: accountBSession },
    );

    await waitFor(() => {
      expect(getByLabelText('redirect-target').props.children).toBe(
        '/profile-setup',
      );
    });
    expect(usePersistedOnboardingDraftStore.getState().accountId).toBe(
      'account-b',
    );
  });

  it('allows the app only after the persisted workflow is completed', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockResolvedValue(JSON.stringify(envelope({ status: 'completed' })));

    const { getByText } = await renderWithProviders(
      <RouteAccessGate area="app">
        <Text>App content</Text>
      </RouteAccessGate>,
    );

    await waitFor(() => {
      expect(getByText('App content')).toBeTruthy();
    });
  });
});

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
