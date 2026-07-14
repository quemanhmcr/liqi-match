import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
  SessionIdSchema,
} from '@/shared/contracts/core-v1';
import { SocialRelationshipSnapshotV2Schema } from '@/shared/contracts/core-v2';
import type { RelationshipCapabilityReader } from '@/entities/social-relationship';
import { setConversationTelemetrySink } from '@/features/messages/services/conversation-telemetry';
import { createSupabaseConversationAdapter } from '@/features/messages/services/supabase-conversation-adapter';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '70000000-0000-4000-8000-000000000999',
}));

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 2_000_000_000,
  lifecycle: {
    discoverable: true,
    messagingAllowed: true,
    playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000401'),
    profileId: ProfileIdSchema.parse('30000000-0000-4000-8000-000000000401'),
    state: 'active',
    updatedAt: '2026-07-14T08:00:00.000Z',
    version: 3,
  },
  principal: {
    accountId: AccountIdSchema.parse('01000000-0000-4000-8000-000000000401'),
    expiresAt: '2033-05-18T03:33:20.000Z',
    issuedAt: '2026-07-14T08:00:00.000Z',
    playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000401'),
    sessionId: SessionIdSchema.parse('09000000-0000-4000-8000-000000000401'),
  },
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
      playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000401'),
      profileId: ProfileIdSchema.parse('30000000-0000-4000-8000-000000000401'),
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
    playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000401'),
    canMessage: true,
    lastReadSequence: 1,
    firstUnreadMessageId: '91000000-0000-4000-8000-000000000402',
  },
};

function message(sequence: number, sender: string = surface.viewer.playerId) {
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

function createAdapter(
  options: Readonly<{
    relationshipProvider?: RelationshipCapabilityReader;
  }> = {},
) {
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
  const relationshipProvider =
    options.relationshipProvider ??
    ({
      getRelationship: jest.fn(async () => relationshipSnapshot()),
    } satisfies RelationshipCapabilityReader);
  const uploadAttachment = jest.fn(async () => ({ assetId: 'asset-id' }));
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
    relationshipCapabilitiesProvider: relationshipProvider,
    request: request as never,
    uploadAttachment,
  });
  return {
    accessTokenProvider,
    adapter,
    calls,
    fakeRealtime,
    relationshipProvider,
    rotateAccessToken: (token: string | null) => accessTokenListener?.(token),
    uploadAttachment,
  };
}

function relationshipSnapshot(
  input: Readonly<{
    blocked?: boolean;
    canMessage?: boolean;
    canViewConversation?: boolean;
  }> = {},
) {
  const blocked = input.blocked ?? false;
  const canMessage = input.canMessage ?? !blocked;
  const canViewConversation = input.canViewConversation ?? !blocked;
  return SocialRelationshipSnapshotV2Schema.parse({
    block: {
      targetBlocksViewer: false,
      viewerBlocksTarget: blocked,
    },
    capabilities: {
      blocked,
      canAcceptFriendship: false,
      canBlock: !blocked,
      canCancelFriendship: false,
      canDeclineFriendship: false,
      canDiscover: !blocked,
      canInviteToSession: false,
      canMessage,
      canMute: !blocked,
      canRemoveFriendship: false,
      canReport: true,
      canRequestFriendship: false,
      canUnblock: blocked,
      canUnmute: false,
      canViewConversation,
      canViewPresence: false,
      canViewProfile: !blocked,
      friendshipLabel: 'none',
      muted: false,
    },
    contractVersion: 2,
    friendship: {
      acceptedAt: null,
      label: 'none',
      requestId: null,
      requestState: null,
      requestVersion: null,
      state: 'none',
    },
    mute: { viewerMutedTarget: false },
    relationshipId: '41000000-0000-4000-8000-000000000401',
    targetPlayerId: surface.participants[1]!.playerId,
    targetPrivacy: {
      contractVersion: 2,
      friendshipRequests: 'matched_only',
      playerId: surface.participants[1]!.playerId,
      presenceVisibility: 'friends',
      profileVisibility: 'everyone',
      sessionInvites: 'friends',
      updatedAt: '2026-07-14T08:00:00.000Z',
      version: 1,
    },
    updatedAt: '2026-07-14T08:00:00.000Z',
    version: 1,
    viewerPlayerId: surface.viewer.playerId,
  });
}

async function flushAsyncAuthorization() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Supabase Conversation adapter', () => {
  it('maps canonical inbox surfaces without conflating a match with friendship', async () => {
    const { adapter } = createAdapter();
    await adapter.setSession(session);

    const inbox = await adapter.listConversations();

    expect(inbox.data.items[0]).toMatchObject({
      id: surface.conversation.conversationId,
      relationship: 'match',
      title: 'Peer Player',
      viewerState: { unreadCount: 1 },
    });
    expect(inbox.data.unreadConversationCount).toBe(1);
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
    await flushAsyncAuthorization();

    await adapter.setSession(null);

    expect(fakeRealtime.realtimeClient.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('fails closed across fetch, send, media upload, inbox, and realtime when block authority revokes access', async () => {
    const relationshipProvider = {
      getRelationship: jest.fn(async () =>
        relationshipSnapshot({ blocked: true }),
      ),
    } satisfies RelationshipCapabilityReader;
    const { adapter, calls, fakeRealtime, uploadAttachment } = createAdapter({
      relationshipProvider,
    });
    await adapter.setSession(session);

    await expect(
      adapter.getConversation(surface.conversation.conversationId),
    ).rejects.toMatchObject({
      code: 'relationship_access_revoked',
      retryable: false,
    });
    await expect(
      adapter.sendText({
        clientCreatedAt: '2026-07-14T08:03:00.000Z',
        clientMessageId: message(3).clientMessageId,
        conversationId: surface.conversation.conversationId,
        text: 'Blocked text',
      }),
    ).rejects.toMatchObject({ code: 'relationship_access_revoked' });
    await expect(
      adapter.sendMedia!({
        caption: 'Blocked media',
        clientCreatedAt: '2026-07-14T08:03:00.000Z',
        clientMessageId: 'client:media:00000000-0000-4000-8000-000000000401',
        conversationId: surface.conversation.conversationId,
        media: {
          fileName: 'blocked.jpg',
          fileSize: 1024,
          height: 100,
          mediaType: 'image',
          mimeType: 'image/jpeg',
          uri: 'file:///blocked.jpg',
          width: 100,
        },
      }),
    ).rejects.toMatchObject({ code: 'relationship_access_revoked' });
    const inbox = await adapter.listConversations();
    expect(inbox.data).toMatchObject({
      items: [],
      totalCount: 0,
      unreadConversationCount: 0,
    });

    const events: unknown[] = [];
    adapter.subscribeConversation?.(
      surface.conversation.conversationId,
      (event) => events.push(event),
    );
    await flushAsyncAuthorization();
    expect(events).toEqual([
      {
        code: 'relationship_access_revoked',
        kind: 'access-revoked',
        retryable: false,
      },
    ]);
    expect(fakeRealtime.realtimeClient.channel).not.toHaveBeenCalled();
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(
      calls.some(({ functionName }) => functionName === 'send_message_v1'),
    ).toBe(false);
  });

  it('treats provider outage and unsupported relationship contracts as retryable access unavailability', async () => {
    const unavailableProvider = {
      getRelationship: jest.fn(async () => {
        throw new Error('provider unavailable');
      }),
    } satisfies RelationshipCapabilityReader;
    const unavailable = createAdapter({
      relationshipProvider: unavailableProvider,
    });
    await unavailable.adapter.setSession(session);
    await expect(
      unavailable.adapter.getMessagePage(surface.conversation.conversationId),
    ).rejects.toMatchObject({
      code: 'relationship_access_unavailable',
      retryable: true,
    });
    const realtimeEvents: unknown[] = [];
    unavailable.adapter.subscribeConversation?.(
      surface.conversation.conversationId,
      (event) => realtimeEvents.push(event),
    );
    await flushAsyncAuthorization();
    expect(realtimeEvents).toEqual([
      {
        code: 'relationship_access_unavailable',
        kind: 'access-revoked',
        retryable: true,
      },
    ]);
    expect(
      unavailable.fakeRealtime.realtimeClient.channel,
    ).not.toHaveBeenCalled();

    const incompatibleProvider = {
      getRelationship: jest.fn(async () => ({
        ...relationshipSnapshot(),
        contractVersion: 3,
      })) as never,
    } satisfies RelationshipCapabilityReader;
    const incompatible = createAdapter({
      relationshipProvider: incompatibleProvider,
    });
    await incompatible.adapter.setSession(session);
    await expect(
      incompatible.adapter.getConversation(surface.conversation.conversationId),
    ).rejects.toMatchObject({
      code: 'relationship_access_unavailable',
      retryable: true,
    });
  });

  it('rechecks relationship authority for every operation instead of caching capabilities', async () => {
    let blocked = false;
    const relationshipProvider = {
      getRelationship: jest.fn(async () => relationshipSnapshot({ blocked })),
    } satisfies RelationshipCapabilityReader;
    const { adapter, calls } = createAdapter({ relationshipProvider });
    await adapter.setSession(session);

    await expect(
      adapter.getConversation(surface.conversation.conversationId),
    ).resolves.not.toBeNull();
    blocked = true;
    await expect(
      adapter.sendText({
        clientCreatedAt: '2026-07-14T08:03:00.000Z',
        clientMessageId: message(3).clientMessageId,
        conversationId: surface.conversation.conversationId,
        text: 'Revoked after fetch',
      }),
    ).rejects.toMatchObject({ code: 'relationship_access_revoked' });

    expect(relationshipProvider.getRelationship).toHaveBeenCalledTimes(2);
    expect(
      calls.some(({ functionName }) => functionName === 'send_message_v1'),
    ).toBe(false);
  });

  it('closes realtime and clears peer identity caches on account switch without doing so for token refresh', async () => {
    const { adapter, calls, fakeRealtime, rotateAccessToken } = createAdapter();
    await adapter.setSession(session);
    await adapter.getConversation(surface.conversation.conversationId);
    adapter.subscribeConversation?.(
      surface.conversation.conversationId,
      () => undefined,
    );
    await flushAsyncAuthorization();
    fakeRealtime.status('SUBSCRIBED');
    const removalsBeforeRefresh =
      fakeRealtime.realtimeClient.removeChannel.mock.calls.length;

    rotateAccessToken('rotated-same-account-token');
    expect(fakeRealtime.realtimeClient.removeChannel.mock.calls.length).toBe(
      removalsBeforeRefresh,
    );

    const switchedSession: AuthSession = {
      ...session,
      lifecycle: {
        ...session.lifecycle!,
        playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000499'),
        profileId: ProfileIdSchema.parse(
          '30000000-0000-4000-8000-000000000499',
        ),
      },
      principal: {
        ...session.principal!,
        accountId: AccountIdSchema.parse(
          '01000000-0000-4000-8000-000000000499',
        ),
        playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000499'),
        sessionId: SessionIdSchema.parse(
          '09000000-0000-4000-8000-000000000499',
        ),
      },
      user: { id: '01000000-0000-4000-8000-000000000499' },
    };
    await adapter.setSession(switchedSession);
    expect(
      fakeRealtime.realtimeClient.removeChannel.mock.calls.length,
    ).toBeGreaterThan(removalsBeforeRefresh);

    await adapter.setSession(session);
    await adapter.getMessagePage(surface.conversation.conversationId);
    expect(
      calls.filter(
        ({ functionName }) => functionName === 'get_conversation_surface_v1',
      ),
    ).toHaveLength(2);
  });

  it('never executes a command authorized for an account that switches while capability lookup is pending', async () => {
    let resolveRelationship:
      ((value: ReturnType<typeof relationshipSnapshot>) => void) | undefined;
    const relationshipProvider = {
      getRelationship: jest.fn(
        async () =>
          new Promise<ReturnType<typeof relationshipSnapshot>>((resolve) => {
            resolveRelationship = resolve;
          }),
      ),
    } satisfies RelationshipCapabilityReader;
    const { adapter, calls } = createAdapter({ relationshipProvider });
    await adapter.setSession(session);

    const pendingSend = adapter.sendText({
      clientCreatedAt: '2026-07-14T08:03:00.000Z',
      clientMessageId: message(3).clientMessageId,
      conversationId: surface.conversation.conversationId,
      text: 'Must remain scoped to the original account',
    });
    await flushAsyncAuthorization();
    await adapter.setSession({
      ...session,
      lifecycle: {
        ...session.lifecycle!,
        playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000498'),
        profileId: ProfileIdSchema.parse(
          '30000000-0000-4000-8000-000000000498',
        ),
      },
      principal: {
        ...session.principal!,
        accountId: AccountIdSchema.parse(
          '01000000-0000-4000-8000-000000000498',
        ),
        playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000498'),
        sessionId: SessionIdSchema.parse(
          '09000000-0000-4000-8000-000000000498',
        ),
      },
      user: { id: '01000000-0000-4000-8000-000000000498' },
    });
    resolveRelationship?.(relationshipSnapshot());

    await expect(pendingSend).rejects.toMatchObject({
      code: 'relationship_access_unavailable',
      retryable: true,
    });
    expect(
      calls.some(({ functionName }) => functionName === 'send_message_v1'),
    ).toBe(false);
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
      await flushAsyncAuthorization();
      fakeRealtime.status('SUBSCRIBED');
      fakeRealtime.broadcast();
      await flushAsyncAuthorization();
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
    await flushAsyncAuthorization();
    fakeRealtime.status('SUBSCRIBED');
    fakeRealtime.broadcast();
    await flushAsyncAuthorization();

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
