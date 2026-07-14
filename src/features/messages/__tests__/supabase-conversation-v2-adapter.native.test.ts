import { describe, expect, it, jest } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  SessionIdSchema,
} from '@/shared/contracts/core-v1';

import type { ChatConversationRealtimeEvent } from '../services/chat-message-transport';
import type { MessagesRequestContext } from '../services/chat-repository';
import {
  createSupabaseConversationV2Adapter,
  type SupabaseConversationV2RpcRequest,
} from '../services/supabase-conversation-v2-adapter';

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const accountId = AccountIdSchema.parse(uuid(1));
const viewerId = PlayerIdSchema.parse(uuid(2));
const peerId = PlayerIdSchema.parse(uuid(3));
const thirdId = PlayerIdSchema.parse(uuid(4));
const conversationId = uuid(10);
const sessionId = uuid(11);

function authSession(
  account = accountId,
  player = viewerId,
  token = 'stale-token',
): AuthSession {
  return {
    accessToken: token,
    expiresAt: 4_102_444_800,
    refreshToken: `refresh:${account}`,
    tokenType: 'bearer',
    user: { id: account },
    principal: {
      accountId: account,
      playerId: player,
      sessionId: SessionIdSchema.parse(stableSessionId(account)),
      issuedAt: '2026-07-14T12:00:00.000Z',
      expiresAt: '2099-12-31T00:00:00.000Z',
    },
  };
}

const context: MessagesRequestContext = {
  locale: 'vi-VN',
  timezone: 'Asia/Bangkok',
  viewerId,
};

function mobileSurface(
  input: {
    playerId?: string;
    version?: number;
    cursorVersion?: number;
    lastSequence?: number;
  } = {},
) {
  const activeViewer = PlayerIdSchema.parse(input.playerId ?? viewerId);
  const version = input.version ?? 4;
  const lastSequence = input.lastSequence ?? 3;
  return {
    conversationId,
    createdAt: '2026-07-14T12:00:00.000Z',
    firstUnreadMessageId: uuid(20),
    kind: 'group',
    lastSequence,
    latestMessage: {
      messageId: uuid(20),
      conversationId,
      senderPlayerId: peerId,
      clientMessageId: `session-message:${uuid(21)}`,
      sequence: lastSequence,
      content: { kind: 'text', text: 'Sẵn sàng vào trận chưa?' },
      createdAt: '2026-07-14T12:03:00.000Z',
      tombstonedAt: null,
    },
    legacyConversationId: null,
    membership: { membershipVersion: 2, members: [] },
    muted: false,
    participants: [
      {
        avatarAssetId: null,
        displayName: 'Viewer',
        isSelf: activeViewer === viewerId,
        lifecycleState: 'active',
        memberState: 'active',
        playerId: viewerId,
        profileId: uuid(31),
        role: 'owner',
      },
      {
        avatarAssetId: null,
        displayName: 'Peer',
        isSelf: activeViewer === peerId,
        lifecycleState: 'active',
        memberState: 'active',
        playerId: peerId,
        profileId: uuid(32),
        role: 'member',
      },
      {
        avatarAssetId: null,
        displayName: 'Third',
        isSelf: activeViewer === thirdId,
        lifecycleState: 'active',
        memberState: 'active',
        playerId: thirdId,
        profileId: uuid(33),
        role: 'member',
      },
      ...(activeViewer !== viewerId &&
      activeViewer !== peerId &&
      activeViewer !== thirdId
        ? [
            {
              avatarAssetId: null,
              displayName: 'Second account',
              isSelf: true,
              lifecycleState: 'active' as const,
              memberState: 'active' as const,
              playerId: activeViewer,
              profileId: uuid(34),
              role: 'member' as const,
            },
          ]
        : []),
    ],
    readCursor: {
      conversationId,
      lastReadSequence: Math.max(0, lastSequence - 1),
      playerId: activeViewer,
      updatedAt: '2026-07-14T12:02:00.000Z',
      version: input.cursorVersion ?? 2,
    },
    source: {
      sourceType: 'play_session',
      sourceId: sessionId,
      sourceAggregateVersion: version,
    },
    sources: [],
    state: 'open',
    title: 'Ranked tối thứ Ba',
    tombstonedAt: null,
    unreadCount: 1,
    updatedAt: '2026-07-14T12:03:00.000Z',
    version,
    viewer: {
      canRead: true,
      canSend: true,
      canSubscribe: true,
      conversationId,
      conversationVersion: version,
      membershipVersion: 2,
      playerId: activeViewer,
      reason: 'active_member',
      sourceAggregateVersion: version,
    },
  };
}

type RpcInput = Parameters<SupabaseConversationV2RpcRequest>[0];

function rpcHarness(handler: (input: RpcInput) => unknown | Promise<unknown>) {
  const calls: RpcInput[] = [];
  const request: SupabaseConversationV2RpcRequest = async <T>(
    input: RpcInput,
  ) => {
    calls.push(input);
    return (await handler(input)) as T;
  };
  return { calls, request };
}

function createRealtimeHarness() {
  const entries = new Map<
    string,
    {
      broadcast?: () => void;
      channel: {
        on: ReturnType<typeof jest.fn>;
        subscribe: ReturnType<typeof jest.fn>;
      };
      status?: (status: string) => void;
    }
  >();
  const realtimeClient = {
    channel: jest.fn((topic: string) => {
      const entry: {
        broadcast?: () => void;
        channel: {
          on: ReturnType<typeof jest.fn>;
          subscribe: ReturnType<typeof jest.fn>;
        };
        status?: (status: string) => void;
      } = {
        channel: {
          on: jest.fn(),
          subscribe: jest.fn(),
        },
      };
      entry.channel.on.mockImplementation(
        (
          _kind: string,
          _filter: Readonly<Record<string, unknown>>,
          listener: () => void,
        ) => {
          entry.broadcast = listener;
          return entry.channel;
        },
      );
      entry.channel.subscribe.mockImplementation(
        (listener: (status: string) => void) => {
          entry.status = listener;
          return entry.channel;
        },
      );
      entries.set(topic, entry);
      return entry.channel;
    }),
    removeChannel: jest.fn(async () => 'ok'),
    realtime: { setAuth: jest.fn(async () => undefined) },
  };
  return {
    accessBroadcast: () =>
      entries
        .get(`conversation-v2-access:${conversationId}:${viewerId}`)
        ?.broadcast?.(),
    broadcast: () =>
      entries.get(`conversation-v2:${conversationId}`)?.broadcast?.(),
    channelFor: (topic: string) => entries.get(topic)?.channel,
    realtimeClient,
    statusAll: (value: string) => {
      for (const entry of entries.values()) entry.status?.(value);
    },
  };
}

describe('SupabaseConversationV2Adapter', () => {
  it('maps a session group into the existing Messages UI contract', async () => {
    const realtime = createRealtimeHarness();
    const rpc = rpcHarness(({ functionName }) => {
      if (functionName === 'list_conversation_mobile_inbox_v2') {
        return {
          items: [mobileSurface()],
          pageInfo: { hasNextPage: false, nextCursor: null },
          totalCount: 1,
          unreadConversationCount: 1,
        };
      }
      throw new Error(`unexpected ${functionName}`);
    });
    const adapter = createSupabaseConversationV2Adapter({
      accessTokenProvider: async () => 'refreshed-token',
      accessTokenSubscriber: () => () => undefined,
      realtimeClient: realtime.realtimeClient as never,
      request: rpc.request,
    });
    await adapter.setSession(authSession());

    const result = await adapter.listConversations(
      { filter: 'all', limit: 30, query: '' },
      context,
    );
    expect(result.data.items).toEqual([
      expect.objectContaining({
        id: conversationId,
        kind: 'group',
        relationship: 'team',
        title: 'Ranked tối thứ Ba',
        viewerState: expect.objectContaining({ unreadCount: 1 }),
        participants: expect.objectContaining({ totalCount: 3 }),
      }),
    ]);
    expect(rpc.calls[0]).toEqual(
      expect.objectContaining({
        functionName: 'list_conversation_mobile_inbox_v2',
        session: expect.objectContaining({ accessToken: 'refreshed-token' }),
      }),
    );
    await adapter.dispose();
  });

  it('clears channels and preflights the new account instead of reusing aggregate caches', async () => {
    const realtime = createRealtimeHarness();
    const secondAccountId = AccountIdSchema.parse(uuid(50));
    const secondPlayerId = PlayerIdSchema.parse(uuid(51));
    const rpc = rpcHarness(({ functionName, session: activeSession }) => {
      if (functionName === 'list_conversation_mobile_inbox_v2') {
        return {
          items: [mobileSurface()],
          pageInfo: { hasNextPage: false, nextCursor: null },
          totalCount: 1,
          unreadConversationCount: 1,
        };
      }
      if (functionName === 'get_conversation_mobile_surface_v2') {
        return mobileSurface({
          playerId: activeSession.principal?.playerId ?? undefined,
          version: 9,
        });
      }
      if (functionName === 'send_message_v2') {
        return sendReceipt(secondPlayerId, 10, 4, 'New account attempt.');
      }
      throw new Error(`unexpected ${functionName}`);
    });
    const adapter = createSupabaseConversationV2Adapter({
      accessTokenProvider: async () => 'refreshed-token',
      accessTokenSubscriber: () => () => undefined,
      realtimeClient: realtime.realtimeClient as never,
      request: rpc.request,
    });
    await adapter.setSession(authSession());
    await adapter.listConversations({ limit: 30 }, context);
    const subscription = adapter.subscribeConversation?.(
      conversationId,
      () => undefined,
    );
    await waitFor(() =>
      expect(realtime.realtimeClient.channel).toHaveBeenCalled(),
    );

    await adapter.setSession(
      authSession(secondAccountId, secondPlayerId, 'second-token'),
    );
    expect(realtime.realtimeClient.removeChannel).toHaveBeenCalledWith(
      realtime.channelFor(`conversation-v2:${conversationId}`),
    );
    expect(realtime.realtimeClient.removeChannel).toHaveBeenCalledWith(
      realtime.channelFor(
        `conversation-v2-access:${conversationId}:${viewerId}`,
      ),
    );

    await adapter.sendText({
      clientCreatedAt: '2026-07-14T12:05:00.000Z',
      clientMessageId: IdempotencyKeySchema.parse(`account-switch:${uuid(54)}`),
      conversationId,
      text: 'New account attempt.',
    });
    const functions = rpc.calls.map(({ functionName }) => functionName);
    expect(functions.slice(-2)).toEqual([
      'get_conversation_mobile_surface_v2',
      'send_message_v2',
    ]);
    expect(rpc.calls.at(-1)).toEqual(
      expect.objectContaining({
        body: {
          command: expect.objectContaining({
            metadata: expect.objectContaining({ expectedAggregateVersion: 9 }),
          }),
        },
      }),
    );
    subscription?.remove();
    await adapter.dispose();
  });

  it('sends with the learned aggregate version and revalidates private realtime access', async () => {
    const realtime = createRealtimeHarness();
    const rpc = rpcHarness(({ functionName }) => {
      if (functionName === 'list_conversation_mobile_inbox_v2') {
        return {
          items: [mobileSurface()],
          pageInfo: { hasNextPage: false, nextCursor: null },
          totalCount: 1,
          unreadConversationCount: 1,
        };
      }
      if (functionName === 'get_conversation_mobile_surface_v2') {
        return mobileSurface({ version: 5, lastSequence: 4 });
      }
      if (functionName === 'send_message_v2') {
        return sendReceipt(viewerId, 5, 4, 'Sẵn sàng.');
      }
      throw new Error(`unexpected ${functionName}`);
    });
    const adapter = createSupabaseConversationV2Adapter({
      accessTokenProvider: async () => 'refreshed-token',
      accessTokenSubscriber: () => () => undefined,
      realtimeClient: realtime.realtimeClient as never,
      request: rpc.request,
    });
    await adapter.setSession(authSession());
    await adapter.listConversations({ limit: 30 }, context);

    const clientMessageId = IdempotencyKeySchema.parse(
      `outgoing-message:${uuid(41)}`,
    );
    await expect(
      adapter.sendText({
        clientCreatedAt: '2026-07-14T12:04:00.000Z',
        clientMessageId,
        conversationId,
        text: 'Sẵn sàng.',
      }),
    ).resolves.toMatchObject({
      canonicalMessageId: uuid(40),
      clientMessageId,
      sequence: 4,
    });
    expect(rpc.calls.at(-1)).toEqual(
      expect.objectContaining({
        body: {
          command: expect.objectContaining({
            conversationId,
            metadata: expect.objectContaining({ expectedAggregateVersion: 4 }),
          }),
        },
        functionName: 'send_message_v2',
        session: expect.objectContaining({ accessToken: 'refreshed-token' }),
      }),
    );

    const events: ChatConversationRealtimeEvent[] = [];
    const subscription = adapter.subscribeConversation?.(
      conversationId,
      (event) => events.push(event),
    );
    await waitFor(() =>
      expect(realtime.realtimeClient.channel).toHaveBeenCalledWith(
        `conversation-v2:${conversationId}`,
        { config: { private: true } },
      ),
    );
    expect(realtime.realtimeClient.channel).toHaveBeenCalledWith(
      `conversation-v2:${conversationId}`,
      { config: { private: true } },
    );
    realtime.statusAll('SUBSCRIBED');
    realtime.broadcast();
    await waitFor(() =>
      expect(events).toEqual([{ kind: 'connected' }, { kind: 'changed' }]),
    );
    expect(
      rpc.calls.filter(
        ({ functionName }) =>
          functionName === 'get_conversation_mobile_surface_v2',
      ),
    ).toHaveLength(2);
    subscription?.remove();
    await adapter.dispose();
  });
});

function sendReceipt(
  senderPlayerId: string,
  aggregateVersion: number,
  sequence: number,
  text: string,
) {
  return {
    acceptedAt: '2026-07-14T12:05:00.000Z',
    aggregateVersion,
    conversationId,
    repeated: false,
    message: {
      messageId: uuid(40),
      conversationId,
      senderPlayerId,
      clientMessageId:
        text === 'Sẵn sàng.'
          ? `outgoing-message:${uuid(41)}`
          : `account-switch:${uuid(54)}`,
      sequence,
      content: { kind: 'text', text },
      createdAt: '2026-07-14T12:05:00.000Z',
      tombstonedAt: null,
    },
  };
}

function stableSessionId(value: string) {
  const suffix = value.replaceAll('-', '').slice(-12);
  return `09000000-0000-4000-8000-${suffix}`;
}
