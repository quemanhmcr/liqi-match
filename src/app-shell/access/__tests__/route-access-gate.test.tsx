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
          data: { profileBasics: { displayName: '', gender: 'hidden' } },
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

function completeData(): OnboardingDraftEnvelope['data'] {
  return {
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
  };
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
