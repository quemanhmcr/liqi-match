import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MatchSetDiscoveryScreen } from '../screens/MatchSetDiscoveryScreen';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockJoin = jest.fn();
const mockCreateFromSet = jest.fn(async () => ({
  aggregateId: 'b1000000-0000-4000-8000-000000000001',
}));
let mockPlayerId = '20000000-0000-4000-8000-000000000020';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock('@/entities/match-set', () => ({
  useMatchSetDiscoveryQuery: () => ({
    data: {
      pageParams: [null],
      pages: [
        {
          items: [
            {
              capabilities: { canInvite: false, canRequestJoin: true },
              recommendationContext: {
                reasonCodes: ['intent_kind_overlap', 'open_slot'],
              },
              set: {
                capacity: 5,
                createdAt: '2026-07-14T08:00:00.000Z',
                intentKind: 'team_rank',
                memberPlayerIds: [
                  '20000000-0000-4000-8000-000000000010',
                  '20000000-0000-4000-8000-000000000011',
                ],
                ownerPlayerId: '20000000-0000-4000-8000-000000000010',
                setId: 'a1000000-0000-4000-8000-000000000001',
                state: 'open',
                title: 'Team Sao Băng',
                version: 7,
              },
            },
          ],
          nextCursor: null,
          snapshot: {
            createdAt: '2026-07-14T08:00:00.000Z',
            expiresAt: '2026-07-14T08:10:00.000Z',
            intentVersion: 3,
            snapshotId: 'a2000000-0000-4000-8000-000000000001',
          },
        },
      ],
    },
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: jest.fn(),
  }),
  useRequestSetJoinV1Mutation: () => ({
    isPending: false,
    mutate: mockJoin,
    variables: undefined,
  }),
}));

jest.mock('@/shared/auth/auth-context', () => ({
  useAuth: () => ({
    session: {
      lifecycle: {
        playerId: mockPlayerId,
        state: 'active',
      },
      principal: {
        playerId: mockPlayerId,
      },
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
    prepareCoreV2CommandMetadata: () => ({
      audit: {
        appVersion: 'test',
        clientCreatedAt: '2026-07-14T12:00:00.000Z',
        clientRequestId: 'a3000000-0000-4000-8000-000000000001',
        platform: 'android',
      },
      correlationId: 'a3000000-0000-4000-8000-000000000002',
      expectedVersion: 0,
      idempotencyKey: 'session.test.owner.convert.0001',
    }),
    usePlaySessionServices: () => ({
      commandService: { createFromSet: mockCreateFromSet },
      repository: {},
    }),
  };
});

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  return await render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <MatchSetDiscoveryScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

const initialMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  mockJoin.mockClear();
  mockCreateFromSet.mockClear();
  mockPlayerId = '20000000-0000-4000-8000-000000000020';
});

describe('MatchSetDiscoveryScreen', () => {
  it('renders the authoritative Set snapshot and submits semantic versioned join input', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Team Sao Băng')).toBeTruthy();
    expect(screen.getByText('2/5 thành viên · Team Rank')).toBeTruthy();
    expect(screen.getByText('Cùng mục tiêu')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Xin vào Team Sao Băng'));

    expect(mockJoin).toHaveBeenCalledWith({
      expectedSetVersion: 7,
      setId: 'a1000000-0000-4000-8000-000000000001',
    });
  });

  it('lets only the canonical owner convert a populated Set into a Session', async () => {
    mockPlayerId = '20000000-0000-4000-8000-000000000010';
    const screen = await renderScreen();

    await fireEvent.press(
      screen.getByLabelText('Tạo Session từ Team Sao Băng'),
    );

    await waitFor(() =>
      expect(mockCreateFromSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lifecycle: expect.objectContaining({ playerId: mockPlayerId }),
          principal: expect.objectContaining({ playerId: mockPlayerId }),
        }),
        expect.objectContaining({
          expectedSourceVersion: 7,
          expectedVersion: 0,
          setId: 'a1000000-0000-4000-8000-000000000001',
          title: 'Team Sao Băng',
        }),
      ),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sessions/[sessionId]',
      params: { sessionId: 'b1000000-0000-4000-8000-000000000001' },
    });
  });

  it('returns through the Expo Router boundary', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
