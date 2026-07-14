import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MatchSetDiscoveryScreen } from '../screens/MatchSetDiscoveryScreen';

const mockBack = jest.fn();
const mockJoin = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
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

const initialMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

beforeEach(() => {
  mockBack.mockClear();
  mockJoin.mockClear();
});

describe('MatchSetDiscoveryScreen', () => {
  it('renders the authoritative Set snapshot and submits semantic versioned join input', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <MatchSetDiscoveryScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Team Sao Băng')).toBeTruthy();
    expect(screen.getByText('2/5 thành viên · Team Rank')).toBeTruthy();
    expect(screen.getByText('Cùng mục tiêu')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Xin vào Team Sao Băng'));

    expect(mockJoin).toHaveBeenCalledWith({
      expectedSetVersion: 7,
      setId: 'a1000000-0000-4000-8000-000000000001',
    });
  });

  it('returns through the Expo Router boundary', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <MatchSetDiscoveryScreen />
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
