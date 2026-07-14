import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

const snapshot = {
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
  prepareCoreV2CommandMetadata: (expectedVersion: number) => ({
    audit: {
      appVersion: 'test',
      clientCreatedAt: '2026-07-14T12:00:00.000Z',
      clientRequestId: '94000000-0000-4000-8000-000000000001',
      platform: 'android',
    },
    correlationId: '94000000-0000-4000-8000-000000000002',
    expectedVersion,
    idempotencyKey: 'session.screen.test.0001',
  }),
  useCurrentPlaySessions: () => ({
    data: [snapshot],
    error: null,
    isLoading: false,
  }),
  usePlaySessionCommandMutation: () => ({
    error: null,
    isPending: false,
    mutate: mockMutate,
  }),
  usePlaySessionDetail: () => ({
    data: snapshot,
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
        session: snapshot,
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
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>{screen}</SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockMutate.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
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
    await fireEvent.press(screen.getByText('Tạo buổi chơi'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        capacity: 2,
        expectedVersion: 0,
        initialInviteePlayerIds: [],
        title: 'Party tối nay',
      }),
    );
  });

  it('shows inline validation instead of throwing for an invalid invitee PlayerId', async () => {
    const screen = await renderScreen(<PlaySessionCreateScreen />);
    await fireEvent.changeText(
      screen.getByLabelText('PlayerId mời ban đầu'),
      'not-a-player-id',
    );
    await fireEvent.press(screen.getByText('Tạo buổi chơi'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'PlayerId thứ 1 không phải UUID hợp lệ.',
    );
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('links canonical member profiles and Session conversation', async () => {
    const screen = await renderScreen(<PlaySessionDetailScreen />);
    expect(screen.getAllByText(/membership v2/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByText('Hồ sơ')[1]!);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/profile/[playerId]',
      params: { playerId: PLAYER_B },
    });
    expect(screen.getByText('Communication')).toBeTruthy();
    expect(screen.getAllByText(/ready/).length).toBeGreaterThan(0);
  });
});
