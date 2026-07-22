import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import type { ConversationModerationProvider } from '@/entities/conversation-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import { MessageReportEvidenceV2Schema as ConversationMessageReportEvidenceV2Schema } from '@/shared/contracts/core-v2';
import {
  uploadChatAttachment,
  type LocalImageAsset,
} from '@/shared/services/media-upload';
import {
  SupabaseRestError,
  supabaseRest,
} from '@/shared/services/supabase-rest';

import {
  MessageConversationResponseSchema,
  MessageInboxParamsSchema,
  MessageInboxResponseSchema,
  MessageTimelineParamsSchema,
  MessageTimelineResponseSchema,
  MessagesServiceError,
  messagesContractVersion,
  type MessagesResponse,
} from '../contracts/messages-contracts';
import { matchesMessageInboxFilter } from '../model/message-inbox-filter';
import type {
  AdvanceChatReadCommand,
  AdvanceChatReadReceipt,
  ChatMessageTransport,
  ChatNetworkState,
  SendChatMediaCommand,
  SendChatMessageReceipt,
  SendChatTextCommand,
} from './chat-message-transport';
import type { ChatRepository } from './chat-repository';
import type { ConversationLifecyclePort } from './conversation-lifecycle';
import { emitConversationTelemetry } from './conversation-telemetry';
import {
  ConversationCommandReceiptSurfaceV2Schema,
  ConversationMobileInboxV2Schema,
  ConversationTimelineV2Schema,
  commandMetadata,
  decodeInboxCursor,
  decodeTimelineCursor,
  encodeInboxCursor,
  encodeTimelineCursor,
  parseSurface,
  stableCommandKey,
  stableUuid,
  toConversationDetail,
  toConversationSummary,
  toTimelineItem,
  type CombinedMessageV2,
  type ConversationMobileSurfaceV2,
} from './supabase-conversation-v2-codec';
import {
  MessageReportEvidenceV2Schema,
  type MessageReportEvidenceProvider,
} from './message-report-evidence';

export type SupabaseConversationV2RpcRequest = <T>(input: {
  body: Record<string, unknown>;
  functionName: string;
  session: AuthSession;
  signal?: AbortSignal;
}) => Promise<T>;

type RealtimeClient = Pick<SupabaseClient, 'channel' | 'removeChannel'> & {
  realtime: Pick<SupabaseClient['realtime'], 'setAuth'>;
};

type ConversationChannelSet = Readonly<{
  access: RealtimeChannel;
  message: RealtimeChannel;
}>;

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

export type SupabaseConversationV2Adapter = ChatRepository &
  ChatMessageTransport &
  MessageReportEvidenceProvider &
  ConversationModerationProvider &
  ConversationLifecyclePort & {
    readonly authorityVersion: 2;
    dispose: () => Promise<void>;
    setSession: (session: AuthSession | null) => Promise<void>;
  };

export type SupabaseConversationV2AdapterOptions = {
  accessTokenProvider: AccessTokenProvider;
  accessTokenSubscriber: AccessTokenSubscriber;
  realtimeClient: RealtimeClient;
  request?: SupabaseConversationV2RpcRequest;
  uploadAttachment?: UploadAttachment;
};

export function createSupabaseConversationV2Adapter(
  options: SupabaseConversationV2AdapterOptions,
): SupabaseConversationV2Adapter {
  const request = options.request ?? requestRpc;
  const uploadAttachment = options.uploadAttachment ?? uploadChatAttachment;
  const networkListeners = new Set<(state: ChatNetworkState) => void>();
  const channels = new Map<string, ConversationChannelSet>();
  const surfaceByConversation = new Map<string, ConversationMobileSurfaceV2>();
  const conversationVersionById = new Map<string, number>();
  const cursorVersionById = new Map<string, number>();
  const lastSequenceById = new Map<string, number>();
  const acknowledgedDeliveryMessageIds = new Set<string>();
  let session: AuthSession | null = null;
  let sessionEpoch = 0;
  let requestSequence = 0;
  let networkState: ChatNetworkState = 'online';

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
    const principal = session.principal;
    if (!principal?.playerId || principal.accountId !== session.user.id) {
      throw new MessagesServiceError(
        'unauthenticated',
        'Canonical PlayerId không khớp phiên đăng nhập.',
        false,
      );
    }
    return session;
  };

  const requireValidSession = async (expectedEpoch?: number) => {
    const observedEpoch = sessionEpoch;
    if (expectedEpoch !== undefined && observedEpoch !== expectedEpoch) {
      throw staleSessionError();
    }
    const current = requireSession();
    const accessToken = await options.accessTokenProvider(60);
    if (!accessToken) {
      throw new MessagesServiceError(
        'unauthenticated',
        'Phiên đăng nhập không còn hợp lệ.',
        false,
      );
    }
    if (
      sessionEpoch !== observedEpoch ||
      (expectedEpoch !== undefined && sessionEpoch !== expectedEpoch)
    ) {
      throw staleSessionError();
    }
    return accessToken === current.accessToken
      ? current
      : { ...current, accessToken };
  };

  const clearAuthorityCaches = () => {
    surfaceByConversation.clear();
    conversationVersionById.clear();
    cursorVersionById.clear();
    lastSequenceById.clear();
    acknowledgedDeliveryMessageIds.clear();
  };

  const removeAllChannels = async () => {
    const allChannels = [...channels.values()].flatMap((entry) => [
      entry.message,
      entry.access,
    ]);
    channels.clear();
    await Promise.all(
      allChannels.map((channel) =>
        options.realtimeClient.removeChannel(channel),
      ),
    );
  };

  const unsubscribeAccessToken = options.accessTokenSubscriber(
    (accessToken) => {
      if (!accessToken) {
        sessionEpoch += 1;
        clearAuthorityCaches();
        void removeAllChannels();
        return;
      }
      void options.realtimeClient.realtime.setAuth(accessToken).catch(() => {
        setNetworkState('offline');
      });
    },
  );

  const call = async <T>(
    functionName: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    expectedEpoch?: number,
  ) => {
    try {
      const result = await request<T>({
        body,
        functionName,
        session: await requireValidSession(expectedEpoch),
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
        requestId: `conversation-v2-${requestSequence}`,
      },
    };
  };

  const rememberSurface = (
    surface: ConversationMobileSurfaceV2,
    expectedEpoch = sessionEpoch,
  ) => {
    if (expectedEpoch !== sessionEpoch) throw staleSessionError();
    const active = requireSession();
    const playerId = active.principal?.playerId;
    if (
      !playerId ||
      surface.viewer.playerId !== playerId ||
      surface.readCursor.playerId !== playerId ||
      surface.viewer.conversationId !== surface.conversationId ||
      surface.readCursor.conversationId !== surface.conversationId
    ) {
      throw new MessagesServiceError(
        'contract_violation',
        'Conversation surface không khớp PlayerId hoặc ConversationId hiện tại.',
        false,
      );
    }
    surfaceByConversation.set(surface.conversationId, surface);
    conversationVersionById.set(surface.conversationId, surface.version);
    cursorVersionById.set(surface.conversationId, surface.readCursor.version);
    lastSequenceById.set(surface.conversationId, surface.lastSequence);
    return surface;
  };

  const loadSurface = async (
    conversationId: string,
    signal?: AbortSignal,
    expectedEpoch = sessionEpoch,
  ) => {
    const raw = await call<unknown>(
      'get_conversation_mobile_surface_v2',
      { p_conversation_id: conversationId },
      signal,
      expectedEpoch,
    );
    const surface = parseSurface(raw);
    return rememberSurface(surface, expectedEpoch);
  };

  const ensureSurface = async (conversationId: string) => {
    const cached = surfaceByConversation.get(conversationId);
    return cached ?? loadSurface(conversationId);
  };

  const acknowledgeDeliveries = (
    messages: readonly CombinedMessageV2[],
    surface: ConversationMobileSurfaceV2,
    expectedEpoch: number,
  ) => {
    const pending = messages.filter(
      (message) =>
        message.senderPlayerId !== null &&
        message.senderPlayerId !== surface.viewer.playerId &&
        message.sequence > surface.readCursor.lastReadSequence &&
        !acknowledgedDeliveryMessageIds.has(message.messageId),
    );
    for (const message of pending) {
      acknowledgedDeliveryMessageIds.add(message.messageId);
    }
    void (async () => {
      for (let index = 0; index < pending.length; index += 5) {
        const batch = pending.slice(index, index + 5);
        await Promise.allSettled(
          batch.map(async (message) => {
            try {
              await call<unknown>(
                'acknowledge_message_delivery_v2',
                {
                  command: {
                    causationId: null,
                    correlationId: stableUuid(
                      `delivery:${message.messageId}:${surface.viewer.playerId}`,
                    ),
                    messageId: message.messageId,
                  },
                },
                undefined,
                expectedEpoch,
              );
            } catch {
              acknowledgedDeliveryMessageIds.delete(message.messageId);
            }
          }),
        );
      }
    })();
  };

  const repository: ChatRepository = {
    async getConversation(conversationId, context) {
      const epoch = sessionEpoch;
      const raw = await call<unknown>(
        'get_conversation_mobile_surface_v2',
        { p_conversation_id: conversationId },
        context?.signal,
        epoch,
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
      const surface = rememberSurface(parseSurface(raw), epoch);
      return MessageConversationResponseSchema.parse(
        response(toConversationDetail(surface)),
      );
    },

    async getMessagePage(conversationId, input = {}, context) {
      const canonical = MessageTimelineParamsSchema.parse(input);
      const epoch = sessionEpoch;
      const surface = await loadSurface(conversationId, context?.signal, epoch);
      const beforeSequence = decodeTimelineCursor(
        canonical.cursor,
        conversationId,
      );
      const raw = await call<unknown>(
        'get_conversation_timeline_v2',
        {
          p_before_sequence: beforeSequence,
          p_conversation_id: conversationId,
          p_limit: canonical.limit,
        },
        context?.signal,
        epoch,
      );
      const page = ConversationTimelineV2Schema.parse(raw);
      acknowledgeDeliveries(page.items, surface, epoch);
      return MessageTimelineResponseSchema.parse(
        response({
          items: page.items.map((message) =>
            toTimelineItem(message, surface.viewer.playerId),
          ),
          pageInfo: {
            hasNextPage: page.pageInfo.hasNextPage,
            nextCursor: page.pageInfo.nextCursor
              ? encodeTimelineCursor(conversationId, page.pageInfo.nextCursor)
              : null,
          },
        }),
      );
    },

    async getMessagesAfter(conversationId, afterSequence, context) {
      const epoch = sessionEpoch;
      const surface = await loadSurface(conversationId, context?.signal, epoch);
      if (afterSequence >= surface.lastSequence) {
        return MessageTimelineResponseSchema.parse(
          response({
            items: [],
            pageInfo: { hasNextPage: false, nextCursor: null },
          }),
        );
      }
      const collected: CombinedMessageV2[] = [];
      let beforeSequence: number | null = null;
      let pageCount = 0;
      for (;;) {
        pageCount += 1;
        const raw = await call<unknown>(
          'get_conversation_timeline_v2',
          {
            p_before_sequence: beforeSequence,
            p_conversation_id: conversationId,
            p_limit: 100,
          },
          context?.signal,
          epoch,
        );
        const page = ConversationTimelineV2Schema.parse(raw);
        collected.unshift(
          ...page.items.filter((message) => message.sequence > afterSequence),
        );
        const first = page.items[0];
        if (
          !page.pageInfo.hasNextPage ||
          !page.pageInfo.nextCursor ||
          !first ||
          first.sequence <= afterSequence + 1
        ) {
          break;
        }
        beforeSequence = page.pageInfo.nextCursor;
      }
      const ordered = collected
        .filter(
          (message, index, all) =>
            all.findIndex(
              (candidate) => candidate.sequence === message.sequence,
            ) === index,
        )
        .sort((left, right) => left.sequence - right.sequence);
      for (const [index, message] of ordered.entries()) {
        const expectedSequence = afterSequence + index + 1;
        if (message.sequence !== expectedSequence) {
          throw new MessagesServiceError(
            'contract_violation',
            'Timeline recovery trả về sequence không liên tục.',
            true,
          );
        }
      }
      emitConversationTelemetry('conversation.gap_recovery.succeeded', {
        messageCount: ordered.length,
        pageCount,
      });
      acknowledgeDeliveries(ordered, surface, epoch);
      return MessageTimelineResponseSchema.parse(
        response({
          items: ordered.map((message) =>
            toTimelineItem(message, surface.viewer.playerId),
          ),
          pageInfo: { hasNextPage: false, nextCursor: null },
        }),
      );
    },

    async listConversations(input = {}, context) {
      const canonical = MessageInboxParamsSchema.parse(input);
      const cursor = decodeInboxCursor(canonical.cursor);
      const epoch = sessionEpoch;
      const raw = await call<unknown>(
        'list_conversation_mobile_inbox_v2',
        {
          p_before_conversation_id: cursor?.beforeConversationId ?? null,
          p_before_updated_at: cursor?.beforeUpdatedAt ?? null,
          p_limit: canonical.limit,
        },
        context?.signal,
        epoch,
      );
      const page = ConversationMobileInboxV2Schema.parse(raw);
      const summaries = page.items.map((item) =>
        toConversationSummary(rememberSurface(item, epoch)),
      );
      const normalizedQuery = canonical.query.trim().toLocaleLowerCase('vi');
      const filtered = summaries
        .filter((item) => matchesMessageInboxFilter(item, canonical.filter))
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
          totalCount: summaries.length,
          unreadConversationCount: summaries.filter(
            (item) => item.viewerState.unreadCount > 0,
          ).length,
        }),
      );
    },
  };

  const transport: ChatMessageTransport = {
    async advanceRead(command: AdvanceChatReadCommand) {
      const epoch = sessionEpoch;
      const surface = await loadSurface(
        command.conversationId,
        undefined,
        epoch,
      );
      if (command.lastReadSequence > surface.lastSequence) {
        throw new MessagesServiceError(
          'validation_failed',
          'Read cursor không thể vượt quá sequence hiện tại.',
          false,
        );
      }
      const cursorVersion = surface.readCursor.version;
      const idempotencyKey = stableCommandKey(
        'read',
        `${command.conversationId}:${command.lastReadSequence}`,
        cursorVersion,
      );
      const raw = await call<unknown>(
        'advance_read_cursor_v2',
        {
          command: {
            conversationId: command.conversationId,
            lastReadSequence: command.lastReadSequence,
            metadata: commandMetadata(
              idempotencyKey,
              surface.readCursor.updatedAt,
              cursorVersion,
            ),
          },
        },
        undefined,
        epoch,
      );
      const receipt = ConversationCommandReceiptSurfaceV2Schema.parse(raw);
      if (!receipt.readCursor) {
        throw new MessagesServiceError(
          'contract_violation',
          'Read command receipt thiếu read cursor.',
          false,
        );
      }
      cursorVersionById.set(command.conversationId, receipt.readCursor.version);
      const current = surfaceByConversation.get(command.conversationId);
      if (current) {
        rememberSurface({
          ...current,
          readCursor: receipt.readCursor,
          unreadCount: Math.max(
            0,
            current.lastSequence - receipt.readCursor.lastReadSequence,
          ),
          firstUnreadMessageId: null,
        });
      }
      return {
        lastReadSequence: receipt.readCursor.lastReadSequence,
        unreadCount: Math.max(
          0,
          (lastSequenceById.get(command.conversationId) ?? 0) -
            receipt.readCursor.lastReadSequence,
        ),
      } satisfies AdvanceChatReadReceipt;
    },

    async dispose() {
      unsubscribeAccessToken();
      await removeAllChannels();
      networkListeners.clear();
      clearAuthorityCaches();
      sessionEpoch += 1;
      session = null;
    },

    getNetworkState: () => networkState,

    async sendMedia(command: SendChatMediaCommand) {
      const epoch = sessionEpoch;
      const activeSession = await requireValidSession(epoch);
      const uploaded = await uploadAttachment(activeSession, {
        fileName: command.media.fileName,
        fileSize: command.media.fileSize,
        height: command.media.height,
        mimeType: command.media.mimeType,
        uri: command.media.uri,
        width: command.media.width,
      });
      if (epoch !== sessionEpoch) throw staleSessionError();
      return sendMessage(command, {
        assetId: uploaded.assetId,
        ...(command.caption ? { caption: command.caption } : {}),
        kind: 'media',
      });
    },

    async sendText(command: SendChatTextCommand) {
      return sendMessage(command, { kind: 'text', text: command.text });
    },

    async setSession(nextSession) {
      const identityChanged =
        conversationSessionIdentity(session) !==
        conversationSessionIdentity(nextSession);
      session = nextSession;
      if (!nextSession || identityChanged) {
        sessionEpoch += 1;
        await removeAllChannels();
        clearAuthorityCaches();
      }
    },

    subscribeConversation(conversationId, listener) {
      let removed = false;
      let channelSet: ConversationChannelSet | null = null;
      let messageConnected = false;
      let accessConnected = false;
      let connectedReported = false;
      let disconnectedReported = false;
      const subscriptionEpoch = sessionEpoch;
      const existing = channels.get(conversationId);
      if (existing) {
        channels.delete(conversationId);
        void Promise.all([
          options.realtimeClient.removeChannel(existing.message),
          options.realtimeClient.removeChannel(existing.access),
        ]);
      }

      const removeChannelSet = async () => {
        if (!channelSet) return;
        if (channels.get(conversationId) === channelSet) {
          channels.delete(conversationId);
        }
        await Promise.all([
          options.realtimeClient.removeChannel(channelSet.message),
          options.realtimeClient.removeChannel(channelSet.access),
        ]);
      };

      const revoke = async (error: unknown) => {
        if (removed) return;
        removed = true;
        await removeChannelSet();
        const mapped = realtimeAccessError(error);
        emitConversationTelemetry('conversation.realtime.disconnected', {
          code: mapped.code,
          retryable: mapped.retryable,
        });
        listener({ kind: 'disconnected', retryable: mapped.retryable });
      };

      const currentSubscription = () =>
        !removed &&
        subscriptionEpoch === sessionEpoch &&
        channelSet !== null &&
        channels.get(conversationId) === channelSet;

      const refreshAuthority = async (eventKind: 'access' | 'message') => {
        try {
          const refreshed = await loadSurface(
            conversationId,
            undefined,
            subscriptionEpoch,
          );
          if (!refreshed.viewer.canSubscribe || !currentSubscription()) {
            throw accessRevokedError();
          }
          emitConversationTelemetry(
            eventKind === 'message'
              ? 'conversation.realtime.message_signal'
              : 'conversation.realtime.access_signal',
          );
          listener({ kind: 'changed' });
        } catch (error) {
          await revoke(error);
        }
      };

      const statusHandler =
        (kind: 'access' | 'message') => (status: string) => {
          if (!currentSubscription()) return;
          if (status === 'SUBSCRIBED') {
            if (kind === 'message') messageConnected = true;
            else accessConnected = true;
            if (messageConnected && accessConnected && !connectedReported) {
              connectedReported = true;
              disconnectedReported = false;
              setNetworkState('online');
              listener({ kind: 'connected' });
            }
            return;
          }
          if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            if (kind === 'message') messageConnected = false;
            else accessConnected = false;
            connectedReported = false;
            if (!disconnectedReported) {
              disconnectedReported = true;
              if (status !== 'CLOSED') setNetworkState('offline');
              listener({ kind: 'disconnected', retryable: true });
            }
          }
        };

      void (async () => {
        try {
          const surface = await loadSurface(
            conversationId,
            undefined,
            subscriptionEpoch,
          );
          if (!surface.viewer.canSubscribe) throw accessRevokedError();
          if (removed || subscriptionEpoch !== sessionEpoch) return;

          const messageChannel = options.realtimeClient
            .channel(`conversation-v2:${conversationId}`, {
              config: { private: true },
            })
            .on('broadcast', { event: 'message.changed' }, () => {
              void refreshAuthority('message');
            });
          const accessChannel = options.realtimeClient
            .channel(
              `conversation-v2-access:${conversationId}:${surface.viewer.playerId}`,
              { config: { private: true } },
            )
            .on('broadcast', { event: 'access.changed' }, () => {
              void refreshAuthority('access');
            });
          channelSet = { access: accessChannel, message: messageChannel };
          channels.set(conversationId, channelSet);
          messageChannel.subscribe(statusHandler('message') as never);
          accessChannel.subscribe(statusHandler('access') as never);
        } catch (error) {
          await revoke(error);
        }
      })();

      return {
        remove() {
          if (removed) return;
          removed = true;
          void removeChannelSet();
        },
      };
    },

    subscribeNetworkState(listener) {
      networkListeners.add(listener);
      return { remove: () => networkListeners.delete(listener) };
    },
  };

  const lifecycle: ConversationLifecyclePort = {
    async setMuted(command) {
      const epoch = sessionEpoch;
      const surface = await ensureSurface(command.conversationId);
      if (epoch !== sessionEpoch) throw staleSessionError();
      if (!surface.viewer.canRead || surface.state !== 'open') {
        throw accessRevokedError();
      }
      const aggregateVersion =
        conversationVersionById.get(command.conversationId) ?? surface.version;
      const commandName = command.muted
        ? 'mute_conversation_v2'
        : 'unmute_conversation_v2';
      const raw = await call<unknown>(
        commandName,
        {
          command: {
            conversationId: command.conversationId,
            metadata: commandMetadata(
              stableCommandKey(
                command.muted ? 'mute' : 'unmute',
                command.conversationId,
                aggregateVersion,
              ),
              new Date().toISOString(),
              aggregateVersion,
            ),
          },
        },
        undefined,
        epoch,
      );
      const receipt = ConversationCommandReceiptSurfaceV2Schema.parse(raw);
      conversationVersionById.set(
        command.conversationId,
        receipt.aggregateVersion,
      );
      rememberSurface({
        ...surface,
        muted: command.muted,
        version: receipt.aggregateVersion,
      });
      return {
        conversationId: command.conversationId,
        muted: command.muted,
      };
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
    const epoch = sessionEpoch;
    const active = await requireValidSession(epoch);
    const activePrincipal = active.principal;
    const conversationInput = 'actor' in input ? input : null;
    const sessionInput = 'session' in input ? input : null;
    const identityMatches = conversationInput
      ? Boolean(
          activePrincipal?.playerId &&
          activePrincipal.accountId === conversationInput.actor.accountId &&
          activePrincipal.playerId === conversationInput.actor.playerId,
        )
      : Boolean(
          activePrincipal?.playerId &&
          sessionInput?.session.principal?.playerId &&
          active.user.id === sessionInput.session.user.id &&
          activePrincipal.accountId ===
            sessionInput.session.principal.accountId &&
          activePrincipal.playerId === sessionInput.session.principal.playerId,
        );
    if (!identityMatches) {
      throw new MessagesServiceError(
        'forbidden',
        'Report evidence identity không khớp phiên hiện tại.',
        false,
      );
    }
    const raw = await call<unknown>(
      'capture_message_report_evidence_v2',
      { p_report_id: input.reportId },
      undefined,
      epoch,
    );
    try {
      if (conversationInput) {
        const evidence = ConversationMessageReportEvidenceV2Schema.parse(raw);
        if (
          evidence.conversationId !== conversationInput.conversationId ||
          evidence.message.messageId !== conversationInput.messageId ||
          evidence.reporterPlayerId !== conversationInput.actor.playerId
        ) {
          throw new MessagesServiceError(
            'contract_violation',
            'Report evidence API trả về sai report target.',
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
        'Report evidence API trả dữ liệu không đúng contract.',
        false,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  const moderation: MessageReportEvidenceProvider &
    ConversationModerationProvider = { captureReportEvidence };

  async function sendMessage(
    command: SendChatTextCommand | SendChatMediaCommand,
    content:
      | { kind: 'text'; text: string }
      | { assetId: string; caption?: string; kind: 'media' },
  ): Promise<SendChatMessageReceipt> {
    const kind = content.kind;
    emitConversationTelemetry('conversation.send.started', { kind });
    const epoch = sessionEpoch;
    const surface = await ensureSurface(command.conversationId);
    if (epoch !== sessionEpoch) throw staleSessionError();
    if (!surface.viewer.canSend || surface.state !== 'open') {
      throw accessRevokedError();
    }
    const aggregateVersion =
      conversationVersionById.get(command.conversationId) ?? surface.version;
    const idempotencyKey = stableCommandKey(
      kind === 'text' ? 'send-text' : 'send-media',
      command.clientMessageId,
      aggregateVersion,
    );
    try {
      const raw = await call<unknown>(
        kind === 'text' ? 'send_message_v2' : 'send_media_message_v2',
        {
          command: {
            conversationId: command.conversationId,
            clientMessageId: command.clientMessageId,
            ...(kind === 'text'
              ? { text: content.text }
              : {
                  assetId: content.assetId,
                  ...(content.caption ? { caption: content.caption } : {}),
                }),
            metadata: commandMetadata(
              idempotencyKey,
              command.clientCreatedAt,
              aggregateVersion,
            ),
          },
        },
        undefined,
        epoch,
      );
      const receipt = ConversationCommandReceiptSurfaceV2Schema.parse(raw);
      if (!receipt.message) {
        throw new MessagesServiceError(
          'contract_violation',
          'Send command receipt thiếu canonical message.',
          false,
        );
      }
      conversationVersionById.set(
        command.conversationId,
        receipt.aggregateVersion,
      );
      lastSequenceById.set(command.conversationId, receipt.message.sequence);
      cursorVersionById.delete(command.conversationId);
      const current = surfaceByConversation.get(command.conversationId);
      if (current) {
        surfaceByConversation.set(command.conversationId, {
          ...current,
          lastSequence: receipt.message.sequence,
          latestMessage: receipt.message,
          updatedAt: receipt.message.createdAt,
          version: receipt.aggregateVersion,
        });
      }
      emitConversationTelemetry('conversation.send.succeeded', {
        kind,
        repeated: receipt.repeated,
        sequence: receipt.message.sequence,
      });
      return {
        acceptedAt: receipt.acceptedAt,
        canonicalMessageId: receipt.message.messageId,
        clientMessageId: receipt.message.clientMessageId,
        sequence: receipt.message.sequence,
      };
    } catch (error) {
      if (
        error instanceof MessagesServiceError &&
        error.code === 'stale_cursor'
      ) {
        surfaceByConversation.delete(command.conversationId);
        conversationVersionById.delete(command.conversationId);
      }
      emitConversationTelemetry('conversation.send.failed', {
        code: telemetryErrorCode(error),
        kind,
      });
      throw error;
    }
  }

  return Object.assign(
    { authorityVersion: 2 as const },
    repository,
    transport,
    moderation,
    lifecycle,
  ) as SupabaseConversationV2Adapter;
}

function conversationSessionIdentity(current: AuthSession | null) {
  if (!current) return null;
  return `${current.principal?.accountId ?? current.user.id}:${current.principal?.playerId ?? 'unresolved'}`;
}

function staleSessionError() {
  return new MessagesServiceError(
    'unauthenticated',
    'Conversation authorization thuộc phiên tài khoản cũ.',
    false,
  );
}

function accessRevokedError() {
  return new MessagesServiceError(
    'forbidden',
    'Conversation authority đã thu hồi quyền truy cập.',
    false,
  );
}

function realtimeAccessError(error: unknown) {
  if (error instanceof MessagesServiceError) {
    return { code: error.code, retryable: error.retryable } as const;
  }
  return {
    code: 'network_error' as const,
    retryable: true,
  };
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

function isNetworkFailure(error: unknown) {
  return error instanceof TypeError;
}

function telemetryErrorCode(error: unknown) {
  if (error instanceof MessagesServiceError) return error.code;
  if (error instanceof SupabaseRestError) return error.code ?? error.status;
  return error instanceof Error ? error.name : 'unknown';
}

function mapServiceError(error: unknown) {
  if (error instanceof MessagesServiceError) return error;
  if (error instanceof SupabaseRestError) {
    const code = error.code ?? '';
    if (error.status === 401 || code === 'unauthenticated') {
      return new MessagesServiceError(
        'unauthenticated',
        error.message,
        false,
        error.requestId,
      );
    }
    if (
      code === 'conversation_access_revoked' ||
      code === 'relationship_blocked' ||
      code === 'conversation_tombstoned' ||
      code === 'source_membership_revoked' ||
      code === 'membership_required'
    ) {
      return new MessagesServiceError(
        'forbidden',
        error.message,
        false,
        error.requestId,
      );
    }
    if (
      code === 'conversation_version_conflict' ||
      code === 'read_cursor_version_conflict' ||
      code === 'source_version_conflict'
    ) {
      return new MessagesServiceError(
        'stale_cursor',
        error.message,
        true,
        error.requestId,
      );
    }
    if (error.status === 403) {
      return new MessagesServiceError(
        'forbidden',
        error.message,
        false,
        error.requestId,
      );
    }
    if (error.status === 404 || code === 'conversation_not_found') {
      return new MessagesServiceError(
        'not_found',
        error.message,
        false,
        error.requestId,
      );
    }
    if (error.status === 429) {
      return new MessagesServiceError(
        'rate_limited',
        error.message,
        true,
        error.requestId,
      );
    }
    if (
      code === 'validation_failed' ||
      code === 'message_idempotency_conflict'
    ) {
      return new MessagesServiceError(
        'validation_failed',
        error.message,
        false,
        error.requestId,
      );
    }
    return new MessagesServiceError(
      'unknown',
      error.message,
      error.retryable,
      error.requestId,
    );
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
