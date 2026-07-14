import { describe, expect, it } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  ProfileIdSchema,
  SessionIdSchema,
} from '@/shared/contracts/core-v1';
import { SupabaseRestError } from '@/shared/services/supabase-rest';
import { renderWithProviders } from '@/test/render-with-providers';

import { useChatRuntimeStore } from '../model/chat-runtime-store';
import { ChatConversationScreen } from '../screens/ChatConversationScreen';
import { MessagesScreen } from '../screens/MessagesScreen';

import type { ChatConversationRealtimeEvent } from '../services/chat-message-transport';
import type { MessagesRequestContext } from '../services/chat-repository';
import {
  createSupabaseConversationV2Adapter,
  type SupabaseConversationV2Adapter,
  type SupabaseConversationV2RpcRequest,
} from '../services/supabase-conversation-v2-adapter';

const uuid = (suffix: number) =>
  `10000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const conversationId = uuid(10);
const playSessionId = uuid(11);
const accountA = AccountIdSchema.parse(uuid(101));
const accountB = AccountIdSchema.parse(uuid(102));
const playerA = PlayerIdSchema.parse(uuid(201));
const playerB = PlayerIdSchema.parse(uuid(202));
const playerC = PlayerIdSchema.parse(uuid(203));

const contextA: MessagesRequestContext = {
  locale: 'vi-VN',
  timezone: 'Asia/Bangkok',
  viewerId: playerA,
};
const contextB: MessagesRequestContext = {
  locale: 'vi-VN',
  timezone: 'Asia/Bangkok',
  viewerId: playerB,
};

type ServerMessage = {
  messageId: string;
  conversationId: string;
  senderPlayerId: string;
  clientMessageId: string;
  sequence: number;
  content:
    | { kind: 'text'; text: string }
    | { kind: 'media'; assetId: string; caption?: string };
  createdAt: string;
  tombstonedAt: null;
};

type MemberState = {
  canRead: boolean;
  canSend: boolean;
  canSubscribe: boolean;
  cursorVersion: number;
  lastReadSequence: number;
  muted: boolean;
  reason: 'active_member' | 'source_membership_revoked';
};

type RpcInput = Parameters<SupabaseConversationV2RpcRequest>[0];

class StatefulConversationServer {
  readonly hub = new RealtimeHub(() => this);
  readonly messages: ServerMessage[] = [];
  readonly rpcCalls: RpcInput[] = [];
  private readonly members = new Map<string, MemberState>([
    [
      playerA,
      {
        canRead: true,
        canSend: true,
        canSubscribe: true,
        cursorVersion: 1,
        lastReadSequence: 0,
        muted: false,
        reason: 'active_member',
      },
    ],
    [
      playerB,
      {
        canRead: true,
        canSend: true,
        canSubscribe: true,
        cursorVersion: 1,
        lastReadSequence: 0,
        muted: false,
        reason: 'active_member',
      },
    ],
    [
      playerC,
      {
        canRead: true,
        canSend: true,
        canSubscribe: true,
        cursorVersion: 1,
        lastReadSequence: 0,
        muted: false,
        reason: 'active_member',
      },
    ],
  ]);
  private readonly commandReceipts = new Map<
    string,
    { fingerprint: string; response: Record<string, unknown> }
  >();
  private readonly failNextByPlayer = new Map<string, number>();
  private aggregateVersion = 4;
  private membershipVersion = 2;
  private nowSequence = 0;

  request: SupabaseConversationV2RpcRequest = async <T,>(input: RpcInput) => {
    this.rpcCalls.push(input);
    const playerId = input.session.principal?.playerId;
    if (!playerId) throw this.error('unauthenticated', 401, false);
    const remainingFailures = this.failNextByPlayer.get(playerId) ?? 0;
    if (remainingFailures > 0) {
      this.failNextByPlayer.set(playerId, remainingFailures - 1);
      throw new TypeError('simulated device network loss');
    }
    return (await this.dispatch(playerId, input.functionName, input.body)) as T;
  };

  createRealtimeClient(playerId: string) {
    return this.hub.createClient(playerId);
  }

  failNext(playerId: string, count = 1) {
    this.failNextByPlayer.set(playerId, count);
  }

  setMuted(playerId: string, muted: boolean) {
    this.member(playerId).muted = muted;
  }

  revokeMember(playerId: string) {
    const member = this.member(playerId);
    member.canRead = false;
    member.canSend = false;
    member.canSubscribe = false;
    member.reason = 'source_membership_revoked';
    this.aggregateVersion += 1;
    this.membershipVersion += 1;
    this.hub.broadcast(
      `conversation-v2-access:${conversationId}:${playerId}`,
      'access.changed',
    );
  }

  canReceive(playerId: string, topic: string) {
    if (topic === `conversation-v2:${conversationId}`) {
      return this.member(playerId).canSubscribe;
    }
    return topic === `conversation-v2-access:${conversationId}:${playerId}`;
  }

  private async dispatch(
    playerId: string,
    functionName: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    switch (functionName) {
      case 'list_conversation_mobile_inbox_v2':
        return this.member(playerId).canRead
          ? {
              items: [this.surface(playerId)],
              pageInfo: { hasNextPage: false, nextCursor: null },
              totalCount: 1,
              unreadConversationCount: this.unreadCount(playerId) > 0 ? 1 : 0,
            }
          : {
              items: [],
              pageInfo: { hasNextPage: false, nextCursor: null },
              totalCount: 0,
              unreadConversationCount: 0,
            };
      case 'get_conversation_mobile_surface_v2':
        this.assertRead(playerId);
        return this.surface(playerId);
      case 'get_conversation_timeline_v2':
        this.assertRead(playerId);
        return this.timeline(body);
      case 'send_message_v2':
      case 'send_media_message_v2':
        return this.send(playerId, functionName, body);
      case 'advance_read_cursor_v2':
        return this.advanceRead(playerId, body);
      default:
        throw new Error(`Unexpected RPC ${functionName}`);
    }
  }

  private surface(playerId: string) {
    const member = this.member(playerId);
    const latest = this.messages.at(-1) ?? null;
    const firstUnread = this.messages.find(
      (message) =>
        message.sequence > member.lastReadSequence &&
        message.senderPlayerId !== playerId,
    );
    return {
      conversationId,
      createdAt: '2026-07-14T12:00:00.000Z',
      firstUnreadMessageId: firstUnread?.messageId ?? null,
      kind: 'group',
      lastSequence: this.nowSequence,
      latestMessage: latest,
      membership: { membershipVersion: this.membershipVersion, members: [] },
      muted: member.muted,
      participants: [
        this.participant(playerA, 'An', playerId === playerA, 'owner', 301),
        this.participant(playerB, 'Bình', playerId === playerB, 'member', 302),
        this.participant(playerC, 'Chi', playerId === playerC, 'member', 303),
      ],
      readCursor: {
        conversationId,
        lastReadSequence: member.lastReadSequence,
        playerId,
        updatedAt: this.timestamp(member.cursorVersion),
        version: member.cursorVersion,
      },
      source: {
        sourceType: 'play_session',
        sourceId: playSessionId,
        sourceAggregateVersion: this.aggregateVersion,
      },
      sources: [],
      state: 'open',
      title: 'Team kiểm thử hai thiết bị',
      tombstonedAt: null,
      unreadCount: this.unreadCount(playerId),
      updatedAt: this.timestamp(this.aggregateVersion),
      version: this.aggregateVersion,
      viewer: {
        canRead: member.canRead,
        canSend: member.canSend,
        canSubscribe: member.canSubscribe,
        conversationId,
        conversationVersion: this.aggregateVersion,
        membershipVersion: this.membershipVersion,
        playerId,
        reason: member.reason,
        sourceAggregateVersion: this.aggregateVersion,
      },
    };
  }

  private timeline(body: Record<string, unknown>) {
    const before =
      typeof body.p_before_sequence === 'number'
        ? body.p_before_sequence
        : this.nowSequence + 1;
    const limit = typeof body.p_limit === 'number' ? body.p_limit : 50;
    const descending = this.messages
      .filter((message) => message.sequence < before)
      .sort((left, right) => right.sequence - left.sequence)
      .slice(0, limit);
    const items = [...descending].sort(
      (left, right) => left.sequence - right.sequence,
    );
    const next = items[0]?.sequence ?? null;
    return {
      items,
      pageInfo: {
        hasNextPage: next !== null && next > 1,
        nextCursor: next !== null && next > 1 ? next : null,
      },
    };
  }

  private send(
    playerId: string,
    functionName: string,
    body: Record<string, unknown>,
  ) {
    this.assertSend(playerId);
    const command = body.command as Record<string, unknown>;
    const metadata = command.metadata as Record<string, unknown>;
    const idempotencyKey = String(metadata.idempotencyKey);
    const fingerprint = stableJson(command);
    const previous = this.commandReceipts.get(`${playerId}:${idempotencyKey}`);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw this.error('message_idempotency_conflict', 409, false);
      }
      return { ...previous.response, repeated: true };
    }

    const clientMessageId = String(command.clientMessageId);
    const content =
      functionName === 'send_message_v2'
        ? { kind: 'text' as const, text: String(command.text) }
        : {
            kind: 'media' as const,
            assetId: String(command.assetId),
            ...(command.caption ? { caption: String(command.caption) } : {}),
          };
    const semantic = this.messages.find(
      (message) =>
        message.senderPlayerId === playerId &&
        message.clientMessageId === clientMessageId,
    );
    if (semantic) {
      if (stableJson(semantic.content) !== stableJson(content)) {
        throw this.error('message_idempotency_conflict', 409, false);
      }
      const response = this.sendReceipt(semantic, true);
      this.commandReceipts.set(`${playerId}:${idempotencyKey}`, {
        fingerprint,
        response,
      });
      return response;
    }

    const expectedVersion = Number(metadata.expectedAggregateVersion);
    if (expectedVersion !== this.aggregateVersion) {
      throw this.error('conversation_version_conflict', 409, true);
    }
    this.nowSequence += 1;
    this.aggregateVersion += 1;
    const sender = this.member(playerId);
    sender.lastReadSequence = this.nowSequence;
    sender.cursorVersion += 1;
    const message: ServerMessage = {
      messageId: uuid(400 + this.nowSequence),
      conversationId,
      senderPlayerId: playerId,
      clientMessageId,
      sequence: this.nowSequence,
      content,
      createdAt: this.timestamp(this.nowSequence + 20),
      tombstonedAt: null,
    };
    this.messages.push(message);
    const response = this.sendReceipt(message, false);
    this.commandReceipts.set(`${playerId}:${idempotencyKey}`, {
      fingerprint,
      response,
    });
    this.hub.broadcast(`conversation-v2:${conversationId}`, 'message.changed');
    return response;
  }

  private advanceRead(playerId: string, body: Record<string, unknown>) {
    this.assertRead(playerId);
    const command = body.command as Record<string, unknown>;
    const metadata = command.metadata as Record<string, unknown>;
    const idempotencyKey = String(metadata.idempotencyKey);
    const fingerprint = stableJson(command);
    const previous = this.commandReceipts.get(`${playerId}:${idempotencyKey}`);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw this.error('read_cursor_version_conflict', 409, true);
      }
      return { ...previous.response, repeated: true };
    }
    const member = this.member(playerId);
    if (Number(metadata.expectedAggregateVersion) !== member.cursorVersion) {
      throw this.error('read_cursor_version_conflict', 409, true);
    }
    const requested = Number(command.lastReadSequence);
    if (requested < member.lastReadSequence) {
      throw this.error('read_cursor_regression', 400, false);
    }
    if (requested > this.nowSequence) {
      throw this.error('validation_failed', 400, false);
    }
    if (requested > member.lastReadSequence) {
      member.lastReadSequence = requested;
      member.cursorVersion += 1;
    }
    const response = {
      acceptedAt: this.timestamp(member.cursorVersion + 40),
      aggregateVersion: this.aggregateVersion,
      conversationId,
      repeated: requested === member.lastReadSequence,
      readCursor: {
        conversationId,
        lastReadSequence: member.lastReadSequence,
        playerId,
        updatedAt: this.timestamp(member.cursorVersion + 40),
        version: member.cursorVersion,
      },
    };
    this.commandReceipts.set(`${playerId}:${idempotencyKey}`, {
      fingerprint,
      response,
    });
    return response;
  }

  private sendReceipt(message: ServerMessage, repeated: boolean) {
    return {
      acceptedAt: message.createdAt,
      aggregateVersion: this.aggregateVersion,
      conversationId,
      message,
      repeated,
    };
  }

  private participant(
    playerId: string,
    displayName: string,
    isSelf: boolean,
    role: 'member' | 'owner',
    profileSuffix: number,
  ) {
    return {
      avatarAssetId: null,
      displayName,
      isSelf,
      lifecycleState: 'active',
      memberState: 'active',
      playerId,
      profileId: uuid(profileSuffix),
      role,
    };
  }

  private unreadCount(playerId: string) {
    return Math.max(
      0,
      this.nowSequence - this.member(playerId).lastReadSequence,
    );
  }

  private member(playerId: string) {
    const member = this.members.get(playerId);
    if (!member) throw this.error('membership_required', 403, false);
    return member;
  }

  private assertRead(playerId: string) {
    if (!this.member(playerId).canRead) {
      throw this.error('conversation_access_revoked', 403, false);
    }
  }

  private assertSend(playerId: string) {
    if (!this.member(playerId).canSend) {
      throw this.error('conversation_access_revoked', 403, false);
    }
  }

  private error(code: string, status: number, retryable: boolean) {
    return new SupabaseRestError(
      `simulated ${code}`,
      status,
      code,
      undefined,
      retryable,
    );
  }

  private timestamp(offset: number) {
    return new Date(Date.UTC(2026, 6, 14, 12, 0, offset)).toISOString();
  }
}

class RealtimeHub {
  enabled = true;
  private readonly channels = new Set<FakeRealtimeChannel>();

  constructor(private readonly server: () => StatefulConversationServer) {}

  createClient(playerId: string) {
    return {
      channel: (topic: string) =>
        new FakeRealtimeChannel(topic, playerId, this),
      removeChannel: async (channel: FakeRealtimeChannel) => {
        channel.remove();
        return 'ok';
      },
      realtime: { setAuth: async () => undefined },
    };
  }

  add(channel: FakeRealtimeChannel) {
    this.channels.add(channel);
  }

  remove(channel: FakeRealtimeChannel) {
    this.channels.delete(channel);
  }

  broadcast(topic: string, event: string) {
    if (!this.enabled) return;
    for (const channel of this.channels) {
      if (
        channel.topic === topic &&
        channel.event === event &&
        this.server().canReceive(channel.playerId, topic)
      ) {
        queueMicrotask(() => channel.broadcast?.());
      }
    }
  }
}

class FakeRealtimeChannel {
  broadcast?: () => void;
  event = '';
  private status?: (status: string) => void;

  constructor(
    readonly topic: string,
    readonly playerId: string,
    private readonly hub: RealtimeHub,
  ) {}

  on(
    _kind: string,
    filter: Readonly<{ event?: string }>,
    listener: () => void,
  ) {
    this.event = filter.event ?? '';
    this.broadcast = listener;
    return this;
  }

  subscribe(listener: (status: string) => void) {
    this.status = listener;
    this.hub.add(this);
    queueMicrotask(() => this.status?.('SUBSCRIBED'));
    return this;
  }

  remove() {
    this.hub.remove(this);
    this.status?.('CLOSED');
  }
}

function createDevice(
  server: StatefulConversationServer,
  accountId: string,
  playerId: string,
) {
  const session = authSession(accountId, playerId);
  const adapter = createSupabaseConversationV2Adapter({
    accessTokenProvider: async () => session.accessToken,
    accessTokenSubscriber: () => () => undefined,
    realtimeClient: server.createRealtimeClient(playerId) as never,
    request: server.request,
    uploadAttachment: async () => ({ assetId: uuid(901) }),
  });
  return { adapter, session };
}

function authSession(accountId: string, playerId: string): AuthSession {
  return {
    accessToken: `token:${accountId}`,
    expiresAt: 4_102_444_800,
    refreshToken: `refresh:${accountId}`,
    tokenType: 'bearer',
    user: { id: AccountIdSchema.parse(accountId) },
    lifecycle: {
      discoverable: true,
      messagingAllowed: true,
      playerId: PlayerIdSchema.parse(playerId),
      profileId: ProfileIdSchema.parse(uuid(950 + Number(playerId.slice(-3)))),
      state: 'active',
      updatedAt: '2026-07-14T12:00:00.000Z',
      version: 2,
    },
    principal: {
      accountId: AccountIdSchema.parse(accountId),
      playerId: PlayerIdSchema.parse(playerId),
      sessionId: SessionIdSchema.parse(
        `19000000-0000-4000-8000-${accountId.replaceAll('-', '').slice(-12)}`,
      ),
      issuedAt: '2026-07-14T12:00:00.000Z',
      expiresAt: '2099-12-31T00:00:00.000Z',
    },
  };
}

async function connect(
  adapter: SupabaseConversationV2Adapter,
  events: ChatConversationRealtimeEvent[],
) {
  const subscription = adapter.subscribeConversation?.(
    conversationId,
    (event) => events.push(event),
  );
  await waitFor(() => expect(events).toContainEqual({ kind: 'connected' }));
  return subscription;
}

async function flushUiEffects() {
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

describe('Conversation V2 two-device E2E simulation', () => {
  it('renders the real Messages and Chat screens and sends a reply from device B', async () => {
    useChatRuntimeStore.getState().reset();
    const server = new StatefulConversationServer();
    const deviceA = createDevice(server, accountA, playerA);
    const deviceB = createDevice(server, accountB, playerB);
    await Promise.all([
      deviceA.adapter.setSession(deviceA.session),
      deviceB.adapter.setSession(deviceB.session),
    ]);
    await deviceA.adapter.sendText({
      clientCreatedAt: '2026-07-14T12:05:00.000Z',
      clientMessageId: IdempotencyKeySchema.parse(`ui-e2e-a:${uuid(451)}`),
      conversationId,
      text: 'Thiết bị A nhắn từ UI E2E.',
    });
    // Realtime behavior is covered by the transport E2E cases below. Keep this
    // screen-level case focused on rendering/composer behavior without a second
    // asynchronous refresh racing the optimistic bubble.
    server.hub.enabled = false;

    const inbox = await renderWithProviders(<MessagesScreen />, {
      serviceOverrides: {
        messageRepository: deviceB.adapter,
        messageTransport: deviceB.adapter,
      },
      session: deviceB.session,
    });
    await waitFor(() =>
      expect(inbox.getByText('Team kiểm thử hai thiết bị')).toBeTruthy(),
    );
    expect(inbox.getByText('Thiết bị A nhắn từ UI E2E.')).toBeTruthy();
    expect(inbox.getByLabelText('1 tin nhắn chưa đọc')).toBeTruthy();
    await flushUiEffects();
    await act(async () => inbox.unmount());

    const chat = await renderWithProviders(
      <ChatConversationScreen conversationId={conversationId} />,
      {
        serviceOverrides: {
          messageRepository: deviceB.adapter,
          messageTransport: deviceB.adapter,
        },
        session: deviceB.session,
      },
    );
    await waitFor(() =>
      expect(chat.getByText('Thiết bị A nhắn từ UI E2E.')).toBeTruthy(),
    );
    expect(chat.getByText('Team kiểm thử hai thiết bị')).toBeTruthy();
    await flushUiEffects();

    await fireEvent.changeText(
      chat.getByPlaceholderText('Nhắn tin...'),
      'Thiết bị B trả lời từ UI.',
    );
    await fireEvent.press(chat.getByLabelText('Gửi tin nhắn'));
    await waitFor(() =>
      expect(chat.getByText('Thiết bị B trả lời từ UI.')).toBeTruthy(),
    );
    await waitFor(() => expect(chat.getByLabelText('Đã gửi')).toBeTruthy());
    expect(server.messages).toHaveLength(2);
    expect(server.messages.at(-1)?.content).toEqual({
      kind: 'text',
      text: 'Thiết bị B trả lời từ UI.',
    });
    await flushUiEffects();

    await act(async () => chat.unmount());
    await Promise.all([deviceA.adapter.dispose(), deviceB.adapter.dispose()]);
    await act(async () => useChatRuntimeStore.getState().reset());
  });

  it('keeps ordering, unread/read state, idempotency and media consistent across two devices', async () => {
    const server = new StatefulConversationServer();
    const deviceA = createDevice(server, accountA, playerA);
    const deviceB = createDevice(server, accountB, playerB);
    await Promise.all([
      deviceA.adapter.setSession(deviceA.session),
      deviceB.adapter.setSession(deviceB.session),
    ]);
    const eventsA: ChatConversationRealtimeEvent[] = [];
    const eventsB: ChatConversationRealtimeEvent[] = [];
    const subscriptions = await Promise.all([
      connect(deviceA.adapter, eventsA),
      connect(deviceB.adapter, eventsB),
    ]);

    const clientMessageId = IdempotencyKeySchema.parse(
      `two-device-text:${uuid(501)}`,
    );
    const firstReceipt = await deviceA.adapter.sendText({
      clientCreatedAt: '2026-07-14T12:10:00.000Z',
      clientMessageId,
      conversationId,
      text: 'Thiết bị A đã sẵn sàng.',
    });
    expect(firstReceipt.sequence).toBe(1);
    await waitFor(() =>
      expect(eventsB.filter((event) => event.kind === 'changed')).toHaveLength(
        1,
      ),
    );

    const timelineB = await deviceB.adapter.getMessagePage(conversationId);
    expect(timelineB.data.items).toEqual([
      expect.objectContaining({
        direction: 'incoming',
        sequence: 1,
        text: 'Thiết bị A đã sẵn sàng.',
      }),
    ]);
    const inboxA = await deviceA.adapter.listConversations({}, contextA);
    const inboxB = await deviceB.adapter.listConversations({}, contextB);
    expect(inboxA.data.items[0]?.viewerState.unreadCount).toBe(0);
    expect(inboxB.data.items[0]?.viewerState.unreadCount).toBe(1);

    await expect(
      deviceB.adapter.advanceRead?.({
        conversationId,
        lastReadSequence: 1,
      }),
    ).resolves.toEqual({ lastReadSequence: 1, unreadCount: 0 });
    expect(
      (await deviceB.adapter.listConversations({}, contextB)).data.items[0]
        ?.viewerState.unreadCount,
    ).toBe(0);

    await expect(
      deviceA.adapter.sendText({
        clientCreatedAt: '2026-07-14T12:10:00.000Z',
        clientMessageId,
        conversationId,
        text: 'Thiết bị A đã sẵn sàng.',
      }),
    ).resolves.toMatchObject({
      canonicalMessageId: firstReceipt.canonicalMessageId,
    });
    expect(server.messages).toHaveLength(1);
    await expect(
      deviceA.adapter.sendText({
        clientCreatedAt: '2026-07-14T12:10:00.000Z',
        clientMessageId,
        conversationId,
        text: 'Payload khác phải bị từ chối.',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed', retryable: false });
    expect(server.messages).toHaveLength(1);

    await deviceA.adapter.sendMedia?.({
      clientCreatedAt: '2026-07-14T12:11:00.000Z',
      clientMessageId: IdempotencyKeySchema.parse(
        `two-device-media:${uuid(502)}`,
      ),
      conversationId,
      media: {
        fileName: 'proof.webp',
        fileSize: 1024,
        height: 800,
        mediaType: 'image',
        mimeType: 'image/webp',
        uri: 'file:///proof.webp',
        width: 1200,
      },
    });
    const mediaTimelineB = await deviceB.adapter.getMessagePage(conversationId);
    expect(mediaTimelineB.data.items.at(-1)).toMatchObject({
      direction: 'incoming',
      kind: 'media',
      sequence: 2,
    });

    for (const subscription of subscriptions) subscription?.remove();
    await Promise.all([deviceA.adapter.dispose(), deviceB.adapter.dispose()]);
  });

  it('recovers a stale concurrent send by refreshing authority before retry', async () => {
    const server = new StatefulConversationServer();
    const deviceA = createDevice(server, accountA, playerA);
    const deviceB = createDevice(server, accountB, playerB);
    await Promise.all([
      deviceA.adapter.setSession(deviceA.session),
      deviceB.adapter.setSession(deviceB.session),
      deviceA.adapter.listConversations({}, contextA),
      deviceB.adapter.listConversations({}, contextB),
    ]);

    await deviceA.adapter.sendText({
      clientCreatedAt: '2026-07-14T12:20:00.000Z',
      clientMessageId: IdempotencyKeySchema.parse(`concurrent-a:${uuid(601)}`),
      conversationId,
      text: 'A thắng optimistic race.',
    });
    const commandB = {
      clientCreatedAt: '2026-07-14T12:20:01.000Z',
      clientMessageId: IdempotencyKeySchema.parse(`concurrent-b:${uuid(602)}`),
      conversationId,
      text: 'B retry sau refresh.',
    };
    await expect(deviceB.adapter.sendText(commandB)).rejects.toMatchObject({
      code: 'stale_cursor',
      retryable: true,
    });
    await expect(deviceB.adapter.sendText(commandB)).resolves.toMatchObject({
      sequence: 2,
    });
    expect(server.messages.map((message) => message.sequence)).toEqual([1, 2]);
    expect(server.messages.map((message) => message.content)).toEqual([
      { kind: 'text', text: 'A thắng optimistic race.' },
      { kind: 'text', text: 'B retry sau refresh.' },
    ]);
    await Promise.all([deviceA.adapter.dispose(), deviceB.adapter.dispose()]);
  });

  it('revokes an open device immediately through its targeted access channel', async () => {
    const server = new StatefulConversationServer();
    const deviceB = createDevice(server, accountB, playerB);
    await deviceB.adapter.setSession(deviceB.session);
    const events: ChatConversationRealtimeEvent[] = [];
    const subscription = await connect(deviceB.adapter, events);

    server.revokeMember(playerB);
    await waitFor(() =>
      expect(events).toContainEqual({
        code: 'relationship_access_revoked',
        kind: 'access-revoked',
        retryable: false,
      }),
    );
    await expect(
      deviceB.adapter.sendText({
        clientCreatedAt: '2026-07-14T12:30:00.000Z',
        clientMessageId: IdempotencyKeySchema.parse(
          `revoked-send:${uuid(701)}`,
        ),
        conversationId,
        text: 'Không được gửi sau revoke.',
      }),
    ).rejects.toMatchObject({
      code: 'relationship_access_revoked',
      retryable: false,
    });
    expect(
      (await deviceB.adapter.listConversations({}, contextB)).data.items,
    ).toEqual([]);
    subscription?.remove();
    await deviceB.adapter.dispose();
  });

  it('keeps mute as presentation policy and recovers network state after retry', async () => {
    const server = new StatefulConversationServer();
    const deviceB = createDevice(server, accountB, playerB);
    await deviceB.adapter.setSession(deviceB.session);
    server.setMuted(playerB, true);
    expect(
      (await deviceB.adapter.listConversations({}, contextB)).data.items[0]
        ?.viewerState.isMuted,
    ).toBe(true);

    await expect(
      deviceB.adapter.sendText({
        clientCreatedAt: '2026-07-14T12:40:00.000Z',
        clientMessageId: IdempotencyKeySchema.parse(`muted-send:${uuid(801)}`),
        conversationId,
        text: 'Mute không khóa gửi tin.',
      }),
    ).resolves.toMatchObject({ sequence: 1 });

    const networkStates: string[] = [];
    const networkSubscription = deviceB.adapter.subscribeNetworkState?.(
      (state) => networkStates.push(state),
    );
    server.failNext(playerB);
    await expect(
      deviceB.adapter.getMessagePage(conversationId),
    ).rejects.toMatchObject({ code: 'network_error', retryable: true });
    expect(deviceB.adapter.getNetworkState?.()).toBe('offline');
    await expect(
      deviceB.adapter.getMessagePage(conversationId),
    ).resolves.toBeTruthy();
    expect(deviceB.adapter.getNetworkState?.()).toBe('online');
    expect(networkStates).toEqual(['offline', 'online']);
    networkSubscription?.remove();
    await deviceB.adapter.dispose();
  });
});
