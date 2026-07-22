import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { setConversationTelemetrySink } from '@/features/messages/services/conversation-telemetry';
import { createSupabaseConversationAdapter } from '@/features/messages/services/supabase-conversation-adapter';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '70000000-0000-4000-8000-000000000999',
}));

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 2_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000401' },
};

const surface = {
  conversation: {
    conversationId: '90000000-0000-4000-8000-000000000401',
    matchId: '60000000-0000-4000-8000-000000000401',
    participantIds: [
      '20000000-0000-4000-8000-000000000401',
      '20000000-0000-4000-8000-000000000402',
    ],
    state: 'open',
    lastMessage: {
      messageId: '91000000-0000-4000-8000-000000000402',
      senderPlayerId: '20000000-0000-4000-8000-000000000402',
      sequence: 2,
      kind: 'text',
      preview: 'Sẵn sàng',
      createdAt: '2026-07-14T08:02:00.000Z',
    },
    unreadCount: 1,
    version: 3,
  },
  participants: [
    {
      playerId: '20000000-0000-4000-8000-000000000401',
      profileId: '30000000-0000-4000-8000-000000000401',
      displayName: 'Current Player',
      avatarAssetId: null,
      isSelf: true,
      lifecycleState: 'active',
    },
    {
      playerId: '20000000-0000-4000-8000-000000000402',
      profileId: '30000000-0000-4000-8000-000000000402',
      displayName: 'Peer Player',
      avatarAssetId: '92000000-0000-4000-8000-000000000402',
      isSelf: false,
      lifecycleState: 'active',
    },
  ],
  viewer: {
    playerId: '20000000-0000-4000-8000-000000000401',
    canMessage: true,
    lastReadSequence: 1,
    firstUnreadMessageId: '91000000-0000-4000-8000-000000000402',
  },
};

function message(sequence: number, sender = surface.viewer.playerId) {
  return {
    messageId: `91000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    conversationId: surface.conversation.conversationId,
    senderPlayerId: sender,
    clientMessageId: `client:text:00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    sequence,
    content: { kind: 'text', text: `Message ${sequence}` },
    createdAt: `2026-07-14T08:0${sequence}:00.000Z`,
  };
}

function createFakeRealtime() {
  let broadcast: (() => void) | undefined;
  let status: ((status: string) => void) | undefined;
  let channelOptions: unknown;
  const channel = {
    on: jest.fn((_type, _filter, callback: () => void) => {
      broadcast = callback;
      return channel;
    }),
    subscribe: jest.fn((callback: (nextStatus: string) => void) => {
      status = callback;
      return channel;
    }),
  };
  const realtimeClient = {
    channel: jest.fn((_topic: string, options: unknown) => {
      channelOptions = options;
      return channel;
    }),
    removeChannel: jest.fn(async () => 'ok'),
    realtime: { setAuth: jest.fn(async () => undefined) },
  };
  return {
    broadcast: () => broadcast?.(),
    channelOptions: () => channelOptions,
    realtimeClient,
    status: (nextStatus: string) => status?.(nextStatus),
  };
}

function createAdapter() {
  const fakeRealtime = createFakeRealtime();
  let accessTokenListener: ((token: string | null) => void) | null = null;
  const accessTokenProvider = jest.fn(async () => 'valid-access-token');
  const accessTokenSubscriber = jest.fn(
    (listener: (token: string | null) => void) => {
      accessTokenListener = listener;
      listener(session.accessToken);
      return jest.fn();
    },
  );
  const calls: {
    accessToken?: string;
    body: Record<string, unknown>;
    functionName: string;
  }[] = [];
  const request = jest.fn(
    async ({
      body,
      functionName,
      session: requestSession,
    }: {
      body: Record<string, unknown>;
      functionName: string;
      session: AuthSession;
    }) => {
      calls.push({
        accessToken: requestSession.accessToken,
        body,
        functionName,
      });
      switch (functionName) {
        case 'get_conversation_surface_v1':
          return surface;
        case 'get_conversation_inbox_page_v1':
          return {
            items: [surface],
            totalCount: 1,
            unreadConversationCount: 1,
            pageInfo: { hasNextPage: false, nextCursor: null },
          };
        case 'get_conversation_timeline_v1':
          return body.p_after_sequence === 2
            ? [message(3, surface.participants[1]?.playerId)]
            : [message(1), message(2, surface.participants[1]?.playerId)];
        case 'send_message_v1':
          return { message: message(3), repeated: false };
        case 'advance_conversation_read_v1':
          return {
            readState: {
              conversationId: surface.conversation.conversationId,
              playerId: surface.viewer.playerId,
              lastReadSequence: body.p_last_read_sequence,
              unreadCount: 0,
              updatedAt: '2026-07-14T08:03:00.000Z',
            },
            repeated: false,
          };
        default:
          throw new Error(`Unhandled RPC ${functionName}`);
      }
    },
  );
  const adapter = createSupabaseConversationAdapter({
    accessTokenProvider,
    accessTokenSubscriber,
    realtimeClient: fakeRealtime.realtimeClient as never,
    request: request as never,
    uploadAttachment: jest.fn(async () => ({ assetId: 'asset-id' })),
  });
  return {
    accessTokenProvider,
    adapter,
    calls,
    fakeRealtime,
    rotateAccessToken: (token: string | null) => accessTokenListener?.(token),
  };
}

describe('Supabase Conversation adapter', () => {
  it('maps canonical inbox surfaces without conflating a match with friendship', async () => {
    const { adapter } = createAdapter();
    await adapter.setSession(session);

    const inbox = await adapter.listConversations();
    const direct = await adapter.listConversations({ filter: 'direct' });
    const groups = await adapter.listConversations({ filter: 'group' });

    expect(inbox.data.items[0]).toMatchObject({
      id: surface.conversation.conversationId,
      relationship: 'match',
      source: {
        id: surface.conversation.matchId,
        type: 'direct_match',
      },
      title: 'Peer Player',
      viewerState: { unreadCount: 1 },
    });
    expect(inbox.data.unreadConversationCount).toBe(1);
    expect(direct.data.items).toHaveLength(1);
    expect(direct.data.items[0]?.kind).toBe('direct');
    expect(groups.data.items).toEqual([]);
  });

  it('preserves authoritative sequence and clientMessageId for optimistic dedupe', async () => {
    const { adapter } = createAdapter();
    await adapter.setSession(session);

    const page = await adapter.getMessagePage(
      surface.conversation.conversationId,
    );
    const gap = await adapter.getMessagesAfter?.(
      surface.conversation.conversationId,
      2,
    );

    expect(page.data.items.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(page.data.items[0]?.clientMessageId).toContain('client:text:');
    expect(gap?.data.items.map(({ sequence }) => sequence)).toEqual([3]);
  });

  it('returns the canonical send receipt and advances the server read watermark', async () => {
    const { accessTokenProvider, adapter, calls } = createAdapter();
    await adapter.setSession(session);

    await expect(
      adapter.sendText({
        clientCreatedAt: '2026-07-14T08:03:00.000Z',
        clientMessageId: message(3).clientMessageId,
        conversationId: surface.conversation.conversationId,
        text: 'Message 3',
      }),
    ).resolves.toMatchObject({
      canonicalMessageId: message(3).messageId,
      clientMessageId: message(3).clientMessageId,
      sequence: 3,
    });
    await expect(
      adapter.advanceRead?.({
        conversationId: surface.conversation.conversationId,
        lastReadSequence: 3,
      }),
    ).resolves.toEqual({ lastReadSequence: 3, unreadCount: 0 });
    expect(
      calls.find(({ functionName }) => functionName === 'send_message_v1'),
    ).toMatchObject({
      accessToken: 'valid-access-token',
      body: { p_client_message_id: message(3).clientMessageId },
    });
    expect(accessTokenProvider).toHaveBeenCalledWith(60);
  });

  it('closes private realtime channels when lifecycle authorization is withdrawn', async () => {
    const { adapter, fakeRealtime } = createAdapter();
    await adapter.setSession(session);
    adapter.subscribeConversation?.(
      surface.conversation.conversationId,
      () => undefined,
    );

    await adapter.setSession(null);

    expect(fakeRealtime.realtimeClient.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('emits privacy-safe send, read, gap, and realtime telemetry', async () => {
    const observed: {
      attributes?: Readonly<Record<string, boolean | number | string>>;
      event: string;
    }[] = [];
    const restore = setConversationTelemetrySink((event, attributes) => {
      observed.push({ attributes, event });
    });
    try {
      const { adapter, fakeRealtime } = createAdapter();
      await adapter.setSession(session);
      await adapter.sendText({
        clientCreatedAt: '2026-07-14T08:03:00.000Z',
        clientMessageId: message(3).clientMessageId,
        conversationId: surface.conversation.conversationId,
        text: 'Message 3',
      });
      await adapter.advanceRead?.({
        conversationId: surface.conversation.conversationId,
        lastReadSequence: 3,
      });
      await adapter.getMessagesAfter?.(surface.conversation.conversationId, 2);
      adapter.subscribeConversation?.(
        surface.conversation.conversationId,
        () => undefined,
      );
      fakeRealtime.status('SUBSCRIBED');
      fakeRealtime.broadcast();
      fakeRealtime.status('TIMED_OUT');

      expect(observed.map(({ event }) => event)).toEqual(
        expect.arrayContaining([
          'conversation.send.started',
          'conversation.send.succeeded',
          'conversation.read.succeeded',
          'conversation.gap_recovery.succeeded',
          'conversation.realtime.connected',
          'conversation.realtime.message_signal',
          'conversation.realtime.disconnected',
        ]),
      );
      expect(JSON.stringify(observed)).not.toContain(
        surface.conversation.conversationId,
      );
      expect(JSON.stringify(observed)).not.toContain(
        message(3).clientMessageId,
      );
    } finally {
      restore();
    }
  });

  it('authenticates and joins a private Broadcast channel as a recovery signal', async () => {
    const { adapter, fakeRealtime, rotateAccessToken } = createAdapter();
    const events: string[] = [];
    await adapter.setSession(session);

    const subscription = adapter.subscribeConversation?.(
      surface.conversation.conversationId,
      (event) => events.push(event.kind),
    );
    fakeRealtime.status('SUBSCRIBED');
    fakeRealtime.broadcast();

    expect(fakeRealtime.realtimeClient.realtime.setAuth).toHaveBeenCalledWith(
      session.accessToken,
    );
    rotateAccessToken('rotated-access-token');
    expect(
      fakeRealtime.realtimeClient.realtime.setAuth,
    ).toHaveBeenLastCalledWith('rotated-access-token');
    expect(fakeRealtime.channelOptions()).toEqual({
      config: { private: true },
    });
    expect(events).toEqual(['connected', 'changed']);
    subscription?.remove();
    expect(fakeRealtime.realtimeClient.removeChannel).toHaveBeenCalled();
  });
});
