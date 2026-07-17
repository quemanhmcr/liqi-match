import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  InMemoryPlayerIdentityRepository,
  PlayerIdentityRepositoryProvider,
} from '@/entities/player-identity';
import {
  InMemorySocialRelationshipRepository,
  RelationshipCapabilitiesProvider,
} from '@/entities/social-relationship';

import {
  PlaySessionCreateScreen,
  PlaySessionDetailScreen,
  PlaySessionListScreen,
} from '../index';

const PLAYER_A = '20000000-0000-4000-8000-000000000001';
const PLAYER_B = '20000000-0000-4000-8000-000000000002';
const SESSION_ID = '90000000-0000-4000-8000-000000000001';
const INVITE_ID = '91000000-0000-4000-8000-000000000001';
const CONVERSATION_ID = '92000000-0000-4000-8000-000000000001';
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockMutate = jest.fn();
const mockReset = jest.fn();
let mockCreateError: Error | null = null;
let mockMetadataSequence = 0;
let mockMutationOptions:
  | {
      onError?: (...args: unknown[]) => unknown;
      onSuccess?: (...args: unknown[]) => unknown;
    }
  | undefined;

function mockCreateSnapshot() {
  return {
    cancellationReason: null,
    cancelledAt: null,
    capacity: 2,
    communication: {
      conversationId: CONVERSATION_ID,
      membershipVersion: 2,
      status: 'ready',
    },
    completedAt: null,
    completionClaims: [],
    createdAt: '2026-07-14T12:00:00.000Z',
    members: [
      {
        joinedAt: '2026-07-14T12:00:00.000Z',
        leftAt: null,
        playerId: PLAYER_A,
        role: 'owner',
        state: 'active',
      },
      {
        joinedAt: '2026-07-14T12:01:00.000Z',
        leftAt: null,
        playerId: PLAYER_B,
        role: 'member',
        state: 'active',
      },
    ],
    membershipVersion: 2,
    ownerPlayerId: PLAYER_A,
    readyCheck: {
      checkId: '93000000-0000-4000-8000-000000000001',
      deadlineAt: '2026-07-14T12:30:00.000Z',
      openedAt: '2026-07-14T12:20:00.000Z',
      requiredPlayerIds: [PLAYER_A, PLAYER_B],
      responses: [],
      state: 'open',
    },
    roleAssignments: [],
    scheduledFor: '2026-07-14T13:00:00.000Z',
    sessionId: SESSION_ID,
    source: { kind: 'manual' },
    startedAt: null,
    state: 'ready_check',
    timezone: 'Asia/Bangkok',
    title: 'Party authoritative',
    updatedAt: '2026-07-14T12:20:00.000Z',
    version: 4,
  } as const;
}

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => ({ sessionId: SESSION_ID }),
}));

jest.mock('@/shared/auth/auth-context', () => ({
  useAuth: () => ({
    session: {
      lifecycle: { playerId: PLAYER_A, state: 'active' },
      principal: { playerId: PLAYER_A },
      user: { id: '10000000-0000-4000-8000-000000000001' },
    },
  }),
}));

jest.mock('@/entities/play-session', () => {
  const actual = jest.requireActual<typeof import('@/entities/play-session')>(
    '@/entities/play-session',
  );
  return {
    ...actual,
    usePlaySessionServices: () => ({
      commandService: {},
      conversationMessageTransport: null,
      conversationRepository: null,
      repository: {},
    }),
  };
});

jest.mock('../queries/play-session-queries', () => ({
  prepareCoreV2CommandMetadata: (expectedVersion: number) => {
    mockMetadataSequence += 1;
    const suffix = String(mockMetadataSequence).padStart(12, '0');
    return {
      audit: {
        appVersion: 'test',
        clientCreatedAt: '2026-07-14T12:00:00.000Z',
        clientRequestId: `94000000-0000-4000-8000-${suffix}`,
        platform: 'android',
      },
      correlationId: `95000000-0000-4000-8000-${suffix}`,
      expectedVersion,
      idempotencyKey: `session.screen.test.${suffix}`,
    };
  },
  useCurrentPlaySessions: () => ({
    data: [mockCreateSnapshot()],
    error: null,
    isLoading: false,
  }),
  usePlaySessionCommandMutation: (
    _execute: unknown,
    options?: typeof mockMutationOptions,
  ) => {
    mockMutationOptions = options;
    return {
      error: mockCreateError,
      isPending: false,
      mutate: mockMutate,
      reset: mockReset,
    };
  },
  usePlaySessionDetail: () => ({
    data: mockCreateSnapshot(),
    error: null,
    isLoading: false,
  }),
  usePlaySessionInvites: () => ({
    data: [
      {
        createdAt: '2026-07-14T12:00:00.000Z',
        expiresAt: null,
        inviteId: INVITE_ID,
        inviterPlayerId: PLAYER_B,
        session: mockCreateSnapshot(),
        sessionId: SESSION_ID,
        state: 'pending',
        targetPlayerId: PLAYER_A,
        version: 1,
      },
    ],
    error: null,
    isLoading: false,
  }),
}));

const metrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

async function renderScreen(screen: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
  const identityRepository = new InMemoryPlayerIdentityRepository();
  const relationshipRepository = new InMemorySocialRelationshipRepository();
  return await render(
    <QueryClientProvider client={queryClient}>
      <PlayerIdentityRepositoryProvider repository={identityRepository}>
        <RelationshipCapabilitiesProvider repository={relationshipRepository}>
          <SafeAreaProvider initialMetrics={metrics}>{screen}</SafeAreaProvider>
        </RelationshipCapabilitiesProvider>
      </PlayerIdentityRepositoryProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockCreateError = null;
  mockMetadataSequence = 0;
  mockMutationOptions = undefined;
  mockMutate.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  mockReset.mockClear();
});

describe('Core V2 Party/Session mobile surfaces', () => {
  it('renders current activity and authoritative pending invites', async () => {
    const screen = await renderScreen(<PlaySessionListScreen />);
    expect(screen.getAllByText('Party authoritative')).toHaveLength(2);
    await fireEvent.press(screen.getAllByText('Xem chi tiết')[0]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sessions/[sessionId]',
      params: { sessionId: SESSION_ID },
    });
  });

  it('submits manual create through the command service seam', async () => {
    const screen = await renderScreen(<PlaySessionCreateScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tạo buổi chơi' }),
    );
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        capacity: 3,
        expectedVersion: 0,
        initialInviteePlayerIds: [],
        title: 'Party tối nay',
      }),
    );
  });

  it('reports disabled review configuration instead of a connection conflict', async () => {
    mockCreateError = Object.assign(new Error('disabled'), {
      code: 'feature_disabled',
      retryable: false,
    });
    const screen = await renderScreen(<PlaySessionCreateScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Môi trường này chưa bật quyền tạo buổi chơi. Hãy bật Party/Session review flags rồi thử lại.',
    );
  });

  it('suppresses a double tap before mutation state can rerender', async () => {
    const screen = await renderScreen(<PlaySessionCreateScreen />);
    const button = screen.getByRole('button', { name: 'Tạo buổi chơi' });

    await fireEvent.press(button);
    await fireEvent.press(button);

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('retries the exact same command after an ambiguous network failure', async () => {
    const screen = await renderScreen(<PlaySessionCreateScreen />);
    const button = screen.getByRole('button', { name: 'Tạo buổi chơi' });

    await fireEvent.press(button);
    const firstCommand = mockMutate.mock.calls[0]?.[0];
    await act(async () => {
      await mockMutationOptions?.onError?.(
        Object.assign(new Error('offline'), {
          code: 'network_error',
          retryable: true,
        }),
        firstCommand,
        undefined,
        undefined,
      );
    });
    await fireEvent.press(button);

    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate.mock.calls[1]?.[0]).toEqual(firstCommand);
    expect(mockMetadataSequence).toBe(1);
  });

  it('ignores a late success callback after the create route unmounts', async () => {
    const screen = await renderScreen(<PlaySessionCreateScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Tạo buổi chơi' }),
    );
    await screen.unmount();

    await act(async () => {
      await mockMutationOptions?.onSuccess?.(
        { aggregateId: SESSION_ID },
        mockMutate.mock.calls[0]?.[0],
        undefined,
        undefined,
      );
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses the friend picker and never exposes a raw PlayerId input', async () => {
    const screen = await renderScreen(<PlaySessionCreateScreen />);
    expect(screen.queryByLabelText('PlayerId mời ban đầu')).toBeNull();
    await fireEvent.press(screen.getByText('Chọn bạn'));
    expect(
      await screen.findByText(
        'Chưa có bạn bè phù hợp để chọn cho thao tác này.',
      ),
    ).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('links canonical member profiles and Session conversation', async () => {
    const screen = await renderScreen(<PlaySessionDetailScreen />);
    expect(screen.getByText('2/2 thành viên')).toBeTruthy();
    await fireEvent.press(
      await screen.findByLabelText('Mở hồ sơ Người chơi 2'),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/profile/[playerId]',
      params: { playerId: PLAYER_B },
    });
    await fireEvent.press(screen.getByLabelText('Mở trò chuyện của buổi chơi'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/messages/[conversationId]',
      params: { conversationId: CONVERSATION_ID },
    });
    expect(screen.getByText('Bạn đã sẵn sàng?')).toBeTruthy();
  });
});
