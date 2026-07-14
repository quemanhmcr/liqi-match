import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { InMemoryConversationV2Authority } from '@/entities/conversation-v2/in-memory-conversation-v2-authority';
import { createConversationV2SessionProvisioner } from '@/entities/play-session/conversation-v2-session-provisioner';
import { prepareCoreV2CommandMetadata } from '@/entities/play-session/core-v2-command-metadata';
import { InMemoryRepeatPlaySessionService } from '@/entities/play-session/in-memory-repeat-play-session-service';
import { PlaySessionServicesProvider } from '@/entities/play-session/PlaySessionServicesProvider';
import type { PlaySessionActorContext } from '@/entities/play-session/play-session-repository';
import { InMemoryTrustOutcomesEngine } from '@/entities/trust-outcomes/in-memory-trust-outcomes-engine';
import { createTrustAwarePlaySessionCommandService } from '@/entities/trust-outcomes/play-session-trust-outcome-bridge';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerIdSchema,
  PlayerLifecycleSnapshotV1Schema,
  type PlayerId,
} from '@/shared/contracts/core-v1';

import { PlaySessionCreateScreen } from '../screens/PlaySessionCreateScreen';
import { PlaySessionDetailScreen } from '../screens/PlaySessionDetailScreen';
import { PlaySessionListScreen } from '../screens/PlaySessionListScreen';
import { SessionConversationScreen } from '../screens/SessionConversationScreen';

const A = PlayerIdSchema.parse('b1000000-0000-4000-8000-000000000001');
const B = PlayerIdSchema.parse('b1000000-0000-4000-8000-000000000002');
const NOW = '2026-07-14T12:00:00.000Z';
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockClients: QueryClient[] = [];
let mockParams: Record<string, string | undefined> = {};
let mockSession: AuthSession | null = null;

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/shared/auth/auth-context', () => ({
  useAuth: () => ({ session: mockSession }),
}));

jest.mock('@/shared/core-v2/runtime-uuid', () => {
  let sequence = 500;
  return {
    createRuntimeUuid: () =>
      `b1500000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  };
});

const metrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

function actor(playerId: PlayerId): PlaySessionActorContext {
  const suffix = playerId.slice(-12);
  return {
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: true,
      messagingAllowed: true,
      playerId,
      profileId: `b1100000-0000-4000-8000-${suffix}`,
      state: 'active',
      updatedAt: NOW,
      version: 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId: `b1200000-0000-4000-8000-${suffix}`,
      expiresAt: '2026-07-15T12:00:00.000Z',
      issuedAt: '2026-07-14T11:00:00.000Z',
      playerId,
      sessionId: `b1300000-0000-4000-8000-${suffix}`,
    }),
  };
}

function auth(context: PlaySessionActorContext): AuthSession {
  return {
    accessToken: `token:${context.lifecycle.playerId}`,
    expiresAt: 4_000_000_000,
    lifecycle: context.lifecycle,
    principal: context.principal,
    refreshToken: `refresh:${context.lifecycle.playerId}`,
    tokenType: 'bearer',
    user: { id: context.principal.accountId },
  };
}

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
  mockClients.push(client);
  return client;
}

function createHarness() {
  let sequence = 100;
  let elapsed = 0;
  const clock = () => new Date(Date.parse(NOW) + elapsed++ * 1_000);
  const uuid = () =>
    `b1400000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const conversation = new InMemoryConversationV2Authority({
    clock,
    createUuid: uuid,
  });
  const sessionAuthority = new InMemoryRepeatPlaySessionService({
    clock,
    conversationProvisioner: createConversationV2SessionProvisioner({
      authority: conversation,
      clock,
    }),
    createUuid: uuid,
    lifecycleProvider: { assertActive: async () => undefined },
    relationshipProvider: {
      getInviteEligibility: async () => ({
        allowed: true,
        blocked: false,
        reasonCodes: [],
      }),
    },
    sourceProvider: {
      getMatchParticipantIds: async () => [A, B],
      getSetSnapshot: async () => ({
        capacity: 2,
        memberPlayerIds: [A, B],
        ownerPlayerId: A,
        version: 1,
      }),
    },
  });
  const trust = new InMemoryTrustOutcomesEngine(clock);
  const commandService = createTrustAwarePlaySessionCommandService({
    delegate: sessionAuthority,
    eventLog: sessionAuthority,
    sessionOutcomeRepository: trust,
  });
  return { commandService, conversation, sessionAuthority, trust };
}

type Harness = ReturnType<typeof createHarness>;

async function renderDevice(
  screen: ReactElement,
  client: QueryClient,
  harness: Harness,
): Promise<RenderResult> {
  return await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <PlaySessionServicesProvider
          commandService={harness.commandService}
          conversationMessageTransport={harness.conversation}
          conversationRepository={harness.conversation}
          repository={harness.sessionAuthority}
        >
          {screen}
        </PlaySessionServicesProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

function switchDevice(
  session: AuthSession,
  params: Record<string, string | undefined>,
) {
  mockSession = session;
  mockParams = params;
}

function press(screen: RenderResult, label: string) {
  return fireEvent.press(screen.getByText(label));
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockParams = {};
  mockSession = null;
});

afterEach(async () => {
  await waitFor(() => {
    for (const client of mockClients) {
      expect(client.isMutating()).toBe(0);
      expect(client.isFetching()).toBe(0);
    }
  });
  await Promise.all(mockClients.map((client) => client.cancelQueries()));
  for (const client of mockClients.splice(0)) client.clear();
  mockSession = null;
  mockParams = {};
});

describe('Core V2 two-device mobile E2E', () => {
  it('runs create, invite, ready, chat, start and completion quorum through actual screens', async () => {
    const harness = createHarness();
    const actorA = actor(A);
    const actorB = actor(B);
    const authA = auth(actorA);
    const authB = auth(actorB);
    const deviceA = createQueryClient();
    const deviceB = createQueryClient();

    switchDevice(authA, {});
    let screen = await renderDevice(
      <PlaySessionCreateScreen />,
      deviceA,
      harness,
    );
    await fireEvent.changeText(
      screen.getByLabelText('PlayerId mời ban đầu'),
      B,
    );
    await press(screen, 'Tạo buổi chơi');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const sessionsA = await harness.sessionAuthority.listCurrent(actorA);
    expect(sessionsA).toHaveLength(1);
    const sessionId = sessionsA[0]!.sessionId;
    await expect(
      harness.sessionAuthority.listInvites(actorB),
    ).resolves.toHaveLength(1);
    await screen.unmount();

    switchDevice(authB, {});
    screen = await renderDevice(<PlaySessionListScreen />, deviceB, harness);
    await waitFor(() => {
      if (!screen.queryByText('Tham gia')) {
        throw new Error(
          `Invite not rendered. Tree: ${JSON.stringify(screen.toJSON())}`,
        );
      }
    });
    await press(screen, 'Tham gia');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some((event) => event.eventType === 'session.member_joined.v2'),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorB, sessionId),
    ).resolves.toMatchObject({
      communication: { status: 'ready' },
      membershipVersion: 2,
    });
    await screen.unmount();

    switchDevice(authA, { sessionId });
    screen = await renderDevice(<PlaySessionDetailScreen />, deviceA, harness);
    await waitFor(() => {
      if (!screen.queryByText('Mở ready-check')) {
        throw new Error(
          `Ready action not rendered. Tree: ${JSON.stringify(screen.toJSON())}`,
        );
      }
    });
    await press(screen, 'Mở ready-check');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some((event) => event.eventType === 'session.ready_check_opened.v2'),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorA, sessionId),
    ).resolves.toMatchObject({ state: 'ready_check' });
    await screen.unmount();

    switchDevice(authA, { sessionId });
    screen = await renderDevice(<PlaySessionDetailScreen />, deviceA, harness);
    await waitFor(() => expect(screen.getByText('Tôi sẵn sàng')).toBeTruthy());
    await press(screen, 'Tôi sẵn sàng');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .filter((event) => event.eventType === 'session.member_ready.v2'),
      ).toHaveLength(1),
    );
    expect(
      (await harness.sessionAuthority.get(actorA, sessionId)).readyCheck
        ?.responses,
    ).toEqual([expect.objectContaining({ playerId: A, response: 'ready' })]);
    await screen.unmount();

    switchDevice(authB, { sessionId });
    screen = await renderDevice(<PlaySessionDetailScreen />, deviceB, harness);
    await waitFor(() => expect(screen.getByText('Tôi sẵn sàng')).toBeTruthy());
    await press(screen, 'Tôi sẵn sàng');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some((event) => event.eventType === 'session.ready_check_passed.v2'),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorB, sessionId),
    ).resolves.toMatchObject({ state: 'scheduled' });
    await screen.unmount();

    switchDevice(authA, { sessionId });
    screen = await renderDevice(<PlaySessionDetailScreen />, deviceA, harness);
    await waitFor(() => expect(screen.getByText('Bắt đầu chơi')).toBeTruthy());
    await press(screen, 'Bắt đầu chơi');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some((event) => event.eventType === 'session.started.v2'),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorA, sessionId),
    ).resolves.toMatchObject({ state: 'in_progress' });
    const active = await harness.sessionAuthority.get(actorA, sessionId);
    const conversationId = active.communication.conversationId;
    expect(conversationId).not.toBeNull();
    await screen.unmount();

    switchDevice(authA, { conversationId: conversationId! });
    screen = await renderDevice(
      <SessionConversationScreen />,
      deviceA,
      harness,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Tin nhắn Session')).toBeTruthy(),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Tin nhắn Session'),
      'A đã vào game',
    );
    await press(screen, 'Gửi');
    await waitFor(() => expect(screen.getByText('A đã vào game')).toBeTruthy());
    await screen.unmount();

    switchDevice(authB, { conversationId: conversationId! });
    screen = await renderDevice(
      <SessionConversationScreen />,
      deviceB,
      harness,
    );
    await waitFor(() => expect(screen.getByText('A đã vào game')).toBeTruthy());
    await fireEvent.changeText(
      screen.getByLabelText('Tin nhắn Session'),
      'B đã sẵn sàng',
    );
    await press(screen, 'Gửi');
    await waitFor(() => expect(screen.getByText('B đã sẵn sàng')).toBeTruthy());
    expect(
      (
        await harness.conversation.getTimeline(
          {
            accountId: actorB.principal.accountId,
            lifecycleVersion: actorB.lifecycle.version,
            messagingAllowed: true,
            playerId: B,
          },
          conversationId!,
        )
      ).filter((message) => message.content.kind === 'text'),
    ).toHaveLength(2);
    await screen.unmount();

    switchDevice(authA, { sessionId });
    screen = await renderDevice(<PlaySessionDetailScreen />, deviceA, harness);
    await waitFor(() =>
      expect(screen.getByText('Xác nhận đã chơi xong')).toBeTruthy(),
    );
    await press(screen, 'Xác nhận đã chơi xong');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some(
            (event) => event.eventType === 'session.completion_proposed.v2',
          ),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorA, sessionId),
    ).resolves.toMatchObject({ state: 'completion_pending' });
    await screen.unmount();

    switchDevice(authB, { sessionId });
    screen = await renderDevice(<PlaySessionDetailScreen />, deviceB, harness);
    await waitFor(() =>
      expect(screen.getByText('Xác nhận đã chơi xong')).toBeTruthy(),
    );
    await press(screen, 'Xác nhận đã chơi xong');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some((event) => event.eventType === 'session.completed.v2'),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorB, sessionId),
    ).resolves.toMatchObject({ state: 'completed' });
    await expect(
      harness.trust.getOutcome(authA, sessionId),
    ).resolves.toMatchObject({
      participantPlayerIds: [A, B],
      state: 'recorded',
    });
    await screen.unmount();
  });

  it('refetches a stale invite after version conflict and succeeds on retry', async () => {
    const harness = createHarness();
    const actorA = actor(A);
    const actorB = actor(B);
    const authA = auth(actorA);
    const authB = auth(actorB);
    const deviceA = createQueryClient();
    const deviceB = createQueryClient();

    switchDevice(authA, {});
    let screen = await renderDevice(
      <PlaySessionCreateScreen />,
      deviceA,
      harness,
    );
    await fireEvent.changeText(
      screen.getByLabelText('PlayerId mời ban đầu'),
      B,
    );
    await press(screen, 'Tạo buổi chơi');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const sessionId = (await harness.sessionAuthority.listCurrent(actorA))[0]!
      .sessionId;
    await screen.unmount();

    switchDevice(authB, {});
    screen = await renderDevice(<PlaySessionListScreen />, deviceB, harness);
    await waitFor(() => expect(screen.getByText('Tham gia')).toBeTruthy());
    expect(screen.getByText(/v1/)).toBeTruthy();

    await harness.commandService.schedule(actorA, {
      ...prepareCoreV2CommandMetadata(1),
      scheduledFor: '2026-07-14T13:00:00.000Z',
      sessionId,
      timezone: 'Asia/Bangkok',
    });
    await press(screen, 'Tham gia');

    await waitFor(() => expect(screen.getByText(/v2/)).toBeTruthy());
    expect(
      harness.sessionAuthority
        .listEvents(sessionId)
        .filter((event) => event.eventType === 'session.member_joined.v2'),
    ).toHaveLength(0);

    await press(screen, 'Tham gia');
    await waitFor(() =>
      expect(
        harness.sessionAuthority
          .listEvents(sessionId)
          .some((event) => event.eventType === 'session.member_joined.v2'),
      ).toBe(true),
    );
    await expect(
      harness.sessionAuthority.get(actorB, sessionId),
    ).resolves.toMatchObject({ membershipVersion: 2 });
    await screen.unmount();
  });
});
