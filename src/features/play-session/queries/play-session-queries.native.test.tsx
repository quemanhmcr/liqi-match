import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable } from 'react-native';

import type { PlaySessionActorContext } from '@/entities/play-session';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  PlaySessionCommandReceiptV2Schema,
  type PlaySessionCommandReceiptV2,
} from '@/shared/contracts/core-v2';

import { usePlaySessionCommandMutation } from './play-session-queries';

const PLAYER_A = '21000000-0000-4000-8000-000000000001';
const PLAYER_B = '21000000-0000-4000-8000-000000000002';
let mockSession: AuthSession | null = null;

jest.mock('@/shared/auth/auth-context', () => ({
  useAuth: () => ({ session: mockSession }),
}));

function authSession(playerId: string): AuthSession {
  return {
    accessToken: `token:${playerId}`,
    expiresAt: 4_102_444_800,
    lifecycle: {
      discoverable: true,
      messagingAllowed: true,
      playerId,
      profileId: `31000000-0000-4000-8000-${playerId.slice(-12)}`,
      state: 'active',
      updatedAt: '2026-07-17T00:00:00.000Z',
      version: 1,
    },
    principal: {
      accountId: `11000000-0000-4000-8000-${playerId.slice(-12)}`,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId: `41000000-0000-4000-8000-${playerId.slice(-12)}`,
    },
    refreshToken: `refresh:${playerId}`,
    tokenType: 'bearer',
    user: { id: `11000000-0000-4000-8000-${playerId.slice(-12)}` },
  } as AuthSession;
}

function receipt(): PlaySessionCommandReceiptV2 {
  return PlaySessionCommandReceiptV2Schema.parse({
    aggregateId: '91000000-0000-4000-8000-000000000001',
    aggregateType: 'play_session',
    aggregateVersion: 1,
    commandName: 'create_play_session_v2',
    correlationId: '92000000-0000-4000-8000-000000000001',
    eventIds: ['93000000-0000-4000-8000-000000000001'],
    occurredAt: '2026-07-17T00:00:00.000Z',
    repeated: false,
    resultCode: 'created',
    session: {
      cancellationReason: null,
      cancelledAt: null,
      capacity: 2,
      communication: {
        conversationId: null,
        membershipVersion: 1,
        status: 'pending',
      },
      completedAt: null,
      completionClaims: [],
      createdAt: '2026-07-17T00:00:00.000Z',
      members: [
        {
          joinedAt: '2026-07-17T00:00:00.000Z',
          leftAt: null,
          playerId: PLAYER_B,
          role: 'owner',
          state: 'active',
        },
      ],
      membershipVersion: 1,
      ownerPlayerId: PLAYER_B,
      readyCheck: null,
      roleAssignments: [],
      scheduledFor: null,
      sessionId: '91000000-0000-4000-8000-000000000001',
      source: { kind: 'manual' },
      startedAt: null,
      state: 'recruiting',
      timezone: 'Asia/Bangkok',
      title: 'Latest actor session',
      updatedAt: '2026-07-17T00:00:00.000Z',
      version: 1,
    },
  });
}

type ExecuteMutation = (
  actor: PlaySessionActorContext,
  command: Record<string, never>,
) => Promise<PlaySessionCommandReceiptV2>;

function MutationHarness({
  execute,
  renderVersion: _renderVersion,
}: {
  execute: jest.MockedFunction<ExecuteMutation>;
  renderVersion: number;
}) {
  const mutation =
    usePlaySessionCommandMutation<Record<string, never>>(execute);
  return (
    <Pressable
      accessibilityLabel="Execute latest actor mutation"
      onPress={() => mutation.mutate({})}
    />
  );
}

describe('usePlaySessionCommandMutation lifecycle', () => {
  it('uses the latest authenticated actor after an account switch rerender', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { gcTime: Infinity, retry: false },
        queries: { gcTime: Infinity, retry: false },
      },
    });
    const execute = jest.fn<ExecuteMutation>(async () => receipt());
    mockSession = authSession(PLAYER_A);
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <MutationHarness execute={execute} renderVersion={1} />
      </QueryClientProvider>,
    );

    mockSession = authSession(PLAYER_B);
    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <MutationHarness execute={execute} renderVersion={2} />
      </QueryClientProvider>,
    );
    await fireEvent.press(
      screen.getByLabelText('Execute latest actor mutation'),
    );

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      lifecycle: { playerId: PLAYER_B },
      principal: { playerId: PLAYER_B },
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await screen.unmount();
    queryClient.clear();
  });
});
