import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import type { ConversationModerationProvider } from '@/entities/conversation-v2';
import { MessageReportEvidenceV2Schema as ConversationMessageReportEvidenceV2Schema } from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import {
  uploadChatAttachment,
  type LocalImageAsset,
} from '@/shared/services/media-upload';
import {
  SupabaseRestError,
  supabaseRest,
} from '@/shared/services/supabase-rest';
import {
  ConversationSnapshotV1Schema,
  MessageV1Schema,
  ReadStateV1Schema,
  type MessageV1,
} from '../../../../contracts/core-v1';
import {
  MessageConversationResponseSchema,
  MessageInboxParamsSchema,
  MessageInboxResponseSchema,
  MessageTimelineParamsSchema,
  MessageTimelineResponseSchema,
  MessagesServiceError,
  messagesContractVersion,
  type MessageConversationDetail,
  type MessageConversationSummary,
  type MessageTimelineItem,
  type MessagesResponse,
} from '../contracts/messages-contracts';
import type {
  AdvanceChatReadCommand,
  AdvanceChatReadReceipt,
  ChatMessageTransport,
  ChatNetworkState,
  SendChatMediaCommand,
  SendChatMessageReceipt,
  SendChatTextCommand,
} from './chat-message-transport';
import type { ChatRepository, MessagesRequestContext } from './chat-repository';
import {
  MessageReportEvidenceV2Schema,
  type MessageReportEvidenceProvider,
} from './message-report-evidence';
import { emitConversationTelemetry } from './conversation-telemetry';

const ConversationParticipantSurfaceV1Schema = z.object({
  playerId: z.string().uuid(),
  profileId: z.string().uuid(),
  displayName: z.string().min(1),
  avatarAssetId: z.string().uuid().nullable(),
  isSelf: z.boolean(),
  lifecycleState: z.enum([
    'registered',
    'onboarding',
    'active',
    'suspended',
    'deleting',
    'deleted',
  ]),
});

const ConversationMobileSurfaceV1Schema = z.object({
  conversation: ConversationSnapshotV1Schema,
  participants: z.array(ConversationParticipantSurfaceV1Schema).length(2),
  viewer: z.object({
    playerId: z.string().uuid(),
    canMessage: z.boolean(),
    lastReadSequence: z.number().int().nonnegative(),
    firstUnreadMessageId: z.string().uuid().nullable(),
  }),
});

const InboxCursorV1Schema = z.object({
  beforeLastMessageAt: z.string().datetime({ offset: true }),
  beforeConversationId: z.string().uuid(),
});

const ConversationInboxPageV1Schema = z.object({
  items: z.array(ConversationMobileSurfaceV1Schema),
  totalCount: z.number().int().nonnegative(),
  unreadConversationCount: z.number().int().nonnegative(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: InboxCursorV1Schema.nullable(),
  }),
});

const SendMessageResultV1Schema = z.object({
  message: MessageV1Schema,
  repeated: z.boolean(),
});

const AdvanceReadResultV1Schema = z.object({
  readState: ReadStateV1Schema,
  repeated: z.boolean(),
});

type ConversationMobileSurfaceV1 = z.infer<
  typeof ConversationMobileSurfaceV1Schema
>;
type InboxCursorV1 = z.infer<typeof InboxCursorV1Schema>;

export type RpcRequest = <T>(input: {
  body: Record<string, unknown>;
  functionName: string;
  session: AuthSession;
  signal?: AbortSignal;
}) => Promise<T>;

type RealtimeClient = Pick<SupabaseClient, 'channel' | 'removeChannel'> & {
  realtime: Pick<SupabaseClient['realtime'], 'setAuth'>;
};

type UploadAttachment = (
  session: AuthSession,
  asset: LocalImageAsset,
) => Promise<{ assetId: string }>;

type AccessTokenProvider = (
  minimumValiditySeconds?: number,
) => Promise<string | null>;
type AccessTokenSubscriber = (
  listener: (accessToken: string | null) => void,
) => () => void;

export type SupabaseConversationAdapter = ChatRepository &
  ChatMessageTransport &
  MessageReportEvidenceProvider &
  ConversationModerationProvider & {
    dispose: () => Promise<void>;
    setSession: (session: AuthSession | null) => Promise<void>;
  };

export type SupabaseConversationAdapterOptions = {
  accessTokenProvider: AccessTokenProvider;
  accessTokenSubscriber: AccessTokenSubscriber;
  realtimeClient: RealtimeClient;
  request?: RpcRequest;
  uploadAttachment?: UploadAttachment;
};

export function createSupabaseConversationAdapter(
  options: SupabaseConversationAdapterOptions,
): SupabaseConversationAdapter {
  const request = options.request ?? requestRpc;
  const accessTokenProvider = options.accessTokenProvider;
  const accessTokenSubscriber = options.accessTokenSubscriber;
  const realtimeClient = options.realtimeClient;
  const uploadAttachment = options.uploadAttachment ?? uploadChatAttachment;
  const networkListeners = new Set<(state: ChatNetworkState) => void>();
  const channels = new Map<string, RealtimeChannel>();
  const viewerByConversation = new Map<string, string>();
  let session: AuthSession | null = null;
  let networkState: ChatNetworkState = 'online';
  let requestSequence = 0;

  const setNetworkState = (state: ChatNetworkState) => {
    if (networkState === state) return;
    networkState = state;
    for (const listener of networkListeners) listener(state);
  };

  const requireSession = () => {
    if (!session) {
      throw new MessagesServiceError(
        'unauthenticated',
        'Phiên đăng nhập không khả dụng.',
        false,
      );
    }
    return session;
  };

  const refreshSession = async (current: AuthSession) => {
    const accessToken = await accessTokenProvider(60);
    if (!accessToken) {
      throw new MessagesServiceError(
        'unauthenticated',
        'Phiên đăng nhập không còn hợp lệ.',
        false,
      );
    }
    return accessToken === current.accessToken
      ? current
      : { ...current, accessToken };
  };

  const requireValidSession = () => refreshSession(requireSession());

  const removeAllChannels = async () => {
    await Promise.all(
      [...channels.values()].map((channel) =>
        realtimeClient.removeChannel(channel),
      ),
    );
    channels.clear();
  };

  const unsubscribeAccessToken = accessTokenSubscriber((accessToken) => {
    if (!accessToken) {
      void removeAllChannels();
      return;
    }
    void realtimeClient.realtime.setAuth(accessToken).catch(() => {
      setNetworkState('offline');
    });
  });

  const call = async <T>(
    functionName: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    try {
      const result = await request<T>({
        body,
        functionName,
        session: await requireValidSession(),
        signal,
      });
      setNetworkState('online');
      return result;
    } catch (error) {
      if (isNetworkFailure(error)) setNetworkState('offline');
      throw mapServiceError(error);
    }
  };

  const response = <T>(data: T): MessagesResponse<T> => {
    requestSequence += 1;
    return {
      contractVersion: messagesContractVersion,
      data,
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: `conversation-v1-${requestSequence}`,
      },
    };
  };

  const repository: ChatRepository = {
    async getConversation(conversationId, context) {
      const raw = await call<unknown>(
        'get_conversation_surface_v1',
        { p_conversation_id: conversationId },
        context?.signal,
      ).catch((error) => {
        if (
          error instanceof MessagesServiceError &&
          error.code === 'not_found'
        ) {
          return null;
        }
        throw error;
      });
      if (raw === null) return null;
      const surface = parseSurface(raw);
      viewerByConversation.set(
        surface.conversation.conversationId,
        surface.viewer.playerId,
      );
      return MessageConversationResponseSchema.parse(
        response(toConversationDetail(surface)),
      );
    },

    async getMessagePage(conversationId, input = {}, context) {
      const canonical = MessageTimelineParamsSchema.parse(input);
      const viewerPlayerId = await ensureViewerPlayerId(
        conversationId,
        context,
        call,
        viewerByConversation,
      );
      const beforeSequence = decodeTimelineCursor(
        canonical.cursor,
        conversationId,
      );
      const raw = await call<unknown[]>(
        'get_conversation_timeline_v1',
        {
          p_after_sequence: null,
          p_before_sequence: beforeSequence,
          p_conversation_id: conversationId,
          p_limit: Math.min(canonical.limit + 1, 100),
        },
        context?.signal,
      );
      const messages = z.array(MessageV1Schema).parse(raw);
      const hasNextPage = messages.length > canonical.limit;
      const retained = hasNextPage ? messages.slice(1) : messages;
      const first = retained[0];
      return MessageTimelineResponseSchema.parse(
        response({
          items: retained.map((message) =>
            toTimelineItem(message, viewerPlayerId),
          ),
          pageInfo: {
            hasNextPage,
            nextCursor:
              hasNextPage && first
                ? encodeTimelineCursor(conversationId, first.sequence)
                : null,
          },
        }),
      );
    },

    async getMessagesAfter(conversationId, afterSequence, context) {
      try {
        const viewerPlayerId = await ensureViewerPlayerId(
          conversationId,
          context,
          call,
          viewerByConversation,
        );
        const collected: MessageV1[] = [];
        let cursor = afterSequence;
        let pageCount = 0;

        for (;;) {
          pageCount += 1;
          const raw = await call<unknown[]>(
            'get_conversation_timeline_v1',
            {
              p_after_sequence: cursor,
              p_before_sequence: null,
              p_conversation_id: conversationId,
              p_limit: 100,
            },
            context?.signal,
          );
          const messages = z.array(MessageV1Schema).parse(raw);
          for (const [index, message] of messages.entries()) {
            const expectedSequence = cursor + index + 1;
            if (message.sequence !== expectedSequence) {
              throw new MessagesServiceError(
                'contract_violation',
                'Timeline gap recovery returned a non-contiguous sequence.',
                true,
              );
            }
          }
          collected.push(...messages);
          const last = messages.at(-1);
          if (!last || messages.length < 100) break;
          cursor = last.sequence;
        }

        emitConversationTelemetry('conversation.gap_recovery.succeeded', {
          messageCount: collected.length,
          pageCount,
        });
        return MessageTimelineResponseSchema.parse(
          response({
            items: collected.map((message) =>
              toTimelineItem(message, viewerPlayerId),
            ),
            pageInfo: { hasNextPage: false, nextCursor: null },
          }),
        );
      } catch (error) {
        emitConversationTelemetry('conversation.gap_recovery.failed', {
          code: telemetryErrorCode(error),
        });
        throw error;
      }
    },

    async listConversations(input = {}, context) {
      const canonical = MessageInboxParamsSchema.parse(input);
      const cursor = decodeInboxCursor(canonical.cursor);
      const raw = await call<unknown>(
        'get_conversation_inbox_page_v1',
        {
          p_before_conversation_id: cursor?.beforeConversationId ?? null,
          p_before_last_message_at: cursor?.beforeLastMessageAt ?? null,
          p_limit: canonical.limit,
        },
        context?.signal,
      );
      const page = ConversationInboxPageV1Schema.parse(raw);
      const normalizedQuery = canonical.query.trim().toLocaleLowerCase('vi');
      const summaries = page.items.map((surface) => {
        viewerByConversation.set(
          surface.conversation.conversationId,
          surface.viewer.playerId,
        );
        return toConversationSummary(surface);
      });
      const filtered = summaries
        .filter((item) =>
          canonical.filter === 'unread'
            ? item.viewerState.unreadCount > 0
            : canonical.filter === 'all' ||
              (canonical.filter === 'friends' &&
                item.relationship === 'friend') ||
              (canonical.filter === 'soulmates' &&
                item.relationship === 'soulmate') ||
              (canonical.filter === 'teams' && item.relationship === 'team'),
        )
        .filter(
          (item) =>
            !normalizedQuery ||
            item.title.toLocaleLowerCase('vi').includes(normalizedQuery) ||
            (item.latestActivity?.preview ?? '')
              .toLocaleLowerCase('vi')
              .includes(normalizedQuery),
        );
      return MessageInboxResponseSchema.parse(
        response({
          items: filtered,
          pageInfo: {
            hasNextPage: page.pageInfo.hasNextPage,
            nextCursor: page.pageInfo.nextCursor
              ? encodeInboxCursor(page.pageInfo.nextCursor)
              : null,
          },
          totalCount: page.totalCount,
          unreadConversationCount: page.unreadConversationCount,
        }),
      );
    },
  };

  const transport: ChatMessageTransport = {
    async advanceRead(command: AdvanceChatReadCommand) {
      try {
        const raw = await call<unknown>('advance_conversation_read_v1', {
          p_conversation_id: command.conversationId,
          p_correlation_id: cryptoCorrelationId(),
          p_last_read_sequence: command.lastReadSequence,
        });
        const result = AdvanceReadResultV1Schema.parse(raw);
        emitConversationTelemetry('conversation.read.succeeded', {
          repeated: result.repeated,
          unreadCount: result.readState.unreadCount,
        });
        return {
          lastReadSequence: result.readState.lastReadSequence,
          unreadCount: result.readState.unreadCount,
        } satisfies AdvanceChatReadReceipt;
      } catch (error) {
        emitConversationTelemetry('conversation.read.failed', {
          code: telemetryErrorCode(error),
        });
        throw error;
      }
    },

    async dispose() {
      unsubscribeAccessToken();
      await removeAllChannels();
      networkListeners.clear();
      viewerByConversation.clear();
      session = null;
    },

    getNetworkState: () => networkState,

    async sendMedia(command: SendChatMediaCommand) {
      const activeSession = await requireValidSession();
      const uploaded = await uploadAttachment(activeSession, {
        fileName: command.media.fileName,
        fileSize: command.media.fileSize,
        height: command.media.height,
        mimeType: command.media.mimeType,
        uri: command.media.uri,
        width: command.media.width,
      });
      return sendMessage(command, {
        assetId: uploaded.assetId,
        caption: command.caption,
        kind: 'media',
      });
    },

    async sendText(command: SendChatTextCommand) {
      return sendMessage(command, { kind: 'text', text: command.text });
    },

    async setSession(nextSession) {
      session = nextSession;
      if (!nextSession) await removeAllChannels();
    },

    subscribeConversation(conversationId, listener) {
      const existing = channels.get(conversationId);
      if (existing) void realtimeClient.removeChannel(existing);

      const channel = realtimeClient
        .channel(`conversation:${conversationId}`, {
          config: { private: true },
        })
        .on('broadcast', { event: 'message.changed' }, () => {
          emitConversationTelemetry('conversation.realtime.message_signal');
          listener({ kind: 'changed' });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setNetworkState('online');
            emitConversationTelemetry('conversation.realtime.connected');
            listener({ kind: 'connected' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setNetworkState('offline');
            emitConversationTelemetry('conversation.realtime.disconnected', {
              retryable: true,
              status,
            });
            listener({ kind: 'disconnected', retryable: true });
          } else if (status === 'CLOSED') {
            emitConversationTelemetry('conversation.realtime.disconnected', {
              retryable: true,
              status,
            });
            listener({ kind: 'disconnected', retryable: true });
          }
        });
      channels.set(conversationId, channel);
      return {
        remove() {
          if (channels.get(conversationId) === channel) {
            channels.delete(conversationId);
          }
          void realtimeClient.removeChannel(channel);
        },
      };
    },

    subscribeNetworkState(listener) {
      networkListeners.add(listener);
      return { remove: () => networkListeners.delete(listener) };
    },
  };

  type SessionEvidenceInput = Parameters<
    MessageReportEvidenceProvider['captureReportEvidence']
  >[0];
  type SessionEvidenceResult = Awaited<
    ReturnType<MessageReportEvidenceProvider['captureReportEvidence']>
  >;
  type ConversationEvidenceInput = Parameters<
    ConversationModerationProvider['captureReportEvidence']
  >[0];
  type ConversationEvidenceResult = Awaited<
    ReturnType<ConversationModerationProvider['captureReportEvidence']>
  >;

  async function captureReportEvidence(
    input: SessionEvidenceInput,
  ): Promise<SessionEvidenceResult>;
  async function captureReportEvidence(
    input: ConversationEvidenceInput,
  ): Promise<ConversationEvidenceResult>;
  async function captureReportEvidence(
    input: SessionEvidenceInput | ConversationEvidenceInput,
  ): Promise<SessionEvidenceResult | ConversationEvidenceResult> {
    try {
      const activeSession = await requireValidSession();
      const conversationInput = 'actor' in input ? input : null;
      const sessionInput = 'session' in input ? input : null;
      const activePrincipal = activeSession.principal;
      const identityMatches = conversationInput
        ? Boolean(
            activePrincipal?.playerId &&
            activePrincipal.accountId === conversationInput.actor.accountId &&
            activePrincipal.playerId === conversationInput.actor.playerId,
          )
        : Boolean(
            activePrincipal?.playerId &&
            sessionInput?.session.principal?.playerId &&
            activeSession.user.id === sessionInput.session.user.id &&
            activePrincipal.accountId ===
              sessionInput.session.principal.accountId &&
            activePrincipal.playerId ===
              sessionInput.session.principal.playerId,
          );
      if (!identityMatches) {
        throw new MessagesServiceError(
          'forbidden',
          'Conversation report actor does not match the active session.',
          false,
        );
      }
      const raw = await request<unknown>({
        body: { p_report_id: input.reportId },
        functionName: 'capture_message_report_evidence_v2',
        session: activeSession,
      });
      setNetworkState('online');
      try {
        if (conversationInput) {
          const evidence = ConversationMessageReportEvidenceV2Schema.parse(raw);
          if (
            evidence.conversationId !== conversationInput.conversationId ||
            evidence.message.messageId !== conversationInput.messageId
          ) {
            throw new MessagesServiceError(
              'contract_violation',
              'Bằng chứng báo cáo không khớp Conversation hoặc Message authoritative.',
              false,
            );
          }
          return evidence;
        }
        return MessageReportEvidenceV2Schema.parse(raw);
      } catch (error) {
        if (error instanceof MessagesServiceError) throw error;
        throw new MessagesServiceError(
          'contract_violation',
          'Bằng chứng báo cáo không đúng contract authoritative.',
          false,
          error instanceof Error ? error.message : undefined,
        );
      }
    } catch (error) {
      if (isNetworkFailure(error)) setNetworkState('offline');
      throw mapServiceError(error);
    }
  }

  const moderation: MessageReportEvidenceProvider &
    ConversationModerationProvider = { captureReportEvidence };

  async function sendMessage(
    command: SendChatTextCommand | SendChatMediaCommand,
    content: Record<string, unknown>,
  ): Promise<SendChatMessageReceipt> {
    const kind = String(content.kind ?? 'unknown');
    emitConversationTelemetry('conversation.send.started', { kind });
    try {
      const raw = await call<unknown>('send_message_v1', {
        p_client_created_at: command.clientCreatedAt,
        p_client_message_id: command.clientMessageId,
        p_content: content,
        p_conversation_id: command.conversationId,
        p_correlation_id: cryptoCorrelationId(),
      });
      const result = SendMessageResultV1Schema.parse(raw);
      emitConversationTelemetry('conversation.send.succeeded', {
        kind,
        repeated: result.repeated,
        sequence: result.message.sequence,
      });
      return {
        acceptedAt: result.message.createdAt,
        canonicalMessageId: result.message.messageId,
        clientMessageId: result.message.clientMessageId,
        sequence: result.message.sequence,
      };
    } catch (error) {
      emitConversationTelemetry('conversation.send.failed', {
        code: telemetryErrorCode(error),
        kind,
      });
      throw error;
    }
  }

  return Object.assign(
    repository,
    transport,
    moderation,
  ) as SupabaseConversationAdapter;
}

async function requestRpc<T>(input: {
  body: Record<string, unknown>;
  functionName: string;
  session: AuthSession;
  signal?: AbortSignal;
}) {
  return supabaseRest<T>(`rpc/${input.functionName}`, {
    body: input.body,
    method: 'POST',
    session: input.session,
    signal: input.signal,
  });
}

function parseSurface(raw: unknown) {
  try {
    return ConversationMobileSurfaceV1Schema.parse(raw);
  } catch (error) {
    throw new MessagesServiceError(
      'contract_violation',
      'Conversation API trả dữ liệu không hợp lệ.',
      false,
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function ensureViewerPlayerId(
  conversationId: string,
  context: MessagesRequestContext | undefined,
  call: <T>(
    functionName: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<T>,
  cache: Map<string, string>,
) {
  const cached = cache.get(conversationId);
  if (cached) return cached;
  const raw = await call<unknown>(
    'get_conversation_surface_v1',
    { p_conversation_id: conversationId },
    context?.signal,
  );
  const surface = parseSurface(raw);
  cache.set(conversationId, surface.viewer.playerId);
  return surface.viewer.playerId;
}

function toConversationSummary(
  surface: ConversationMobileSurfaceV1,
): MessageConversationSummary {
  const peer = surface.participants.find((participant) => !participant.isSelf);
  if (!peer) {
    throw new MessagesServiceError(
      'contract_violation',
      'Conversation trực tiếp thiếu người tham gia còn lại.',
    );
  }
  const last = surface.conversation.lastMessage;
  const avatar = peer.avatarAssetId
    ? {
        id: peer.avatarAssetId,
        kind: 'remote' as const,
        url: mediaUrl(peer.avatarAssetId),
        altText: `Ảnh đại diện ${peer.displayName}`,
      }
    : undefined;

  return {
    avatar,
    capabilities: {
      canCall: false,
      canMessage: surface.viewer.canMessage,
      canMute: false,
      canViewDetails: true,
      composerActions: surface.viewer.canMessage
        ? [
            { id: 'image', state: 'available' },
            { id: 'camera', state: 'available' },
            { id: 'team_invite', state: 'coming_soon' },
            { id: 'build_share', state: 'coming_soon' },
            { id: 'voice', state: 'coming_soon' },
          ]
        : [],
    },
    fallbackIcon: 'chatbubble-ellipses-outline',
    id: surface.conversation.conversationId,
    kind: 'direct',
    latestActivity: last
      ? {
          clientMessageId: undefined,
          createdAt: last.createdAt,
          deliveryStatus:
            last.senderPlayerId === surface.viewer.playerId
              ? 'sent'
              : undefined,
          direction:
            last.senderPlayerId === surface.viewer.playerId
              ? 'outgoing'
              : 'incoming',
          id: last.messageId,
          kind: last.kind === 'media' ? 'image' : 'text',
          preview: last.preview,
          senderDisplayName:
            last.senderPlayerId === surface.viewer.playerId
              ? undefined
              : peer.displayName,
          sequence: last.sequence,
        }
      : null,
    participants: {
      preview: [toParticipant(peer)],
      totalCount: surface.participants.length,
    },
    presence: { label: 'Đã ghép đôi', state: 'hidden' },
    relationship: 'match',
    title: peer.displayName,
    viewerState: {
      firstUnreadMessageId: surface.viewer.firstUnreadMessageId ?? undefined,
      isArchived: surface.conversation.state === 'archived',
      isMuted: false,
      isPinned: false,
      unreadCount: surface.conversation.unreadCount,
    },
  };
}

function toConversationDetail(
  surface: ConversationMobileSurfaceV1,
): MessageConversationDetail {
  const summary = toConversationSummary(surface);
  return {
    ...summary,
    composer: {
      disabledReason: surface.viewer.canMessage
        ? undefined
        : 'Cuộc trò chuyện hiện không thể nhận tin nhắn mới',
      placeholder: 'Nhắn tin...',
    },
    liveState: { typingParticipantIds: [] },
    members: surface.participants.map(toParticipant),
    subtitle:
      summary.title === 'Người chơi đã xóa' ? summary.title : 'Đã ghép đôi',
  };
}

function toParticipant(
  participant: z.infer<typeof ConversationParticipantSurfaceV1Schema>,
) {
  return {
    avatar: participant.avatarAssetId
      ? {
          altText: `Ảnh đại diện ${participant.displayName}`,
          id: participant.avatarAssetId,
          kind: 'remote' as const,
          url: mediaUrl(participant.avatarAssetId),
        }
      : undefined,
    displayName: participant.displayName,
    id: participant.playerId,
    role: 'member' as const,
  };
}

function toTimelineItem(
  message: MessageV1,
  viewerPlayerId: string,
): MessageTimelineItem {
  const base = {
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
    deliveryStatus:
      message.senderPlayerId === viewerPlayerId ? ('sent' as const) : undefined,
    direction:
      message.senderPlayerId === viewerPlayerId
        ? ('outgoing' as const)
        : ('incoming' as const),
    id: message.messageId,
    senderId: message.senderPlayerId,
    sequence: message.sequence,
  };

  if (message.content.kind === 'text') {
    return { ...base, kind: 'text', text: message.content.text };
  }
  if (message.content.kind === 'media') {
    return {
      ...base,
      caption: message.content.caption,
      kind: 'media',
      mediaType: 'image',
      source: {
        id: message.content.assetId,
        kind: 'remote',
        url: mediaUrl(message.content.assetId),
      },
    };
  }
  return {
    ...base,
    kind: 'text',
    text:
      message.content.eventType === 'message_removed'
        ? 'Tin nhắn đã bị xoá'
        : 'Sự kiện hệ thống',
  };
}

function mediaUrl(assetId: string) {
  return new URL(
    `media/${encodeURIComponent(assetId)}`,
    env.EXPO_PUBLIC_MEDIA_BASE_URL.endsWith('/')
      ? env.EXPO_PUBLIC_MEDIA_BASE_URL
      : `${env.EXPO_PUBLIC_MEDIA_BASE_URL}/`,
  ).toString();
}

function encodeTimelineCursor(conversationId: string, beforeSequence: number) {
  return `timeline:v1:${conversationId}:${beforeSequence}`;
}

function decodeTimelineCursor(
  cursor: string | undefined,
  conversationId: string,
) {
  if (!cursor) return null;
  const match = /^timeline:v1:([0-9a-f-]{36}):(\d+)$/i.exec(cursor);
  if (!match || match[1] !== conversationId) {
    throw new MessagesServiceError(
      'stale_cursor',
      'Cursor timeline không hợp lệ.',
      true,
    );
  }
  return Number(match[2]);
}

function encodeInboxCursor(cursor: InboxCursorV1) {
  return `inbox:v1:${encodeURIComponent(cursor.beforeLastMessageAt)}:${cursor.beforeConversationId}`;
}

function decodeInboxCursor(cursor: string | undefined): InboxCursorV1 | null {
  if (!cursor) return null;
  const match = /^inbox:v1:([^:]+):([0-9a-f-]{36})$/i.exec(cursor);
  if (!match) {
    throw new MessagesServiceError(
      'stale_cursor',
      'Cursor hộp thư không hợp lệ.',
      true,
    );
  }
  const encodedTimestamp = match[1];
  const conversationId = match[2];
  if (!encodedTimestamp || !conversationId) {
    throw new MessagesServiceError(
      'stale_cursor',
      'Cursor hộp thư không hợp lệ.',
      true,
    );
  }
  return InboxCursorV1Schema.parse({
    beforeLastMessageAt: decodeURIComponent(encodedTimestamp),
    beforeConversationId: conversationId,
  });
}

function cryptoCorrelationId() {
  return Crypto.randomUUID();
}

function isNetworkFailure(error: unknown) {
  return error instanceof TypeError;
}

function telemetryErrorCode(error: unknown) {
  if (error instanceof MessagesServiceError) return error.code;
  if (error instanceof SupabaseRestError)
    return error.code ?? `http_${error.status}`;
  return error instanceof Error ? error.name : 'unknown';
}

function mapServiceError(error: unknown) {
  if (error instanceof MessagesServiceError) return error;
  if (error instanceof SupabaseRestError) {
    if (error.status === 401) {
      return new MessagesServiceError('unauthenticated', error.message, false);
    }
    if (error.status === 403) {
      return new MessagesServiceError('forbidden', error.message, false);
    }
    if (error.status === 404 || error.code === 'P0002') {
      return new MessagesServiceError('not_found', error.message, false);
    }
    if (error.status === 429) {
      return new MessagesServiceError('rate_limited', error.message, true);
    }
    if (error.code === '22023') {
      return new MessagesServiceError(
        'validation_failed',
        error.message,
        false,
      );
    }
  }
  if (isNetworkFailure(error)) {
    return new MessagesServiceError(
      'network_error',
      'Không thể kết nối dịch vụ tin nhắn.',
      true,
    );
  }
  return new MessagesServiceError(
    'unknown',
    error instanceof Error ? error.message : 'Lỗi dịch vụ tin nhắn.',
    true,
  );
}
