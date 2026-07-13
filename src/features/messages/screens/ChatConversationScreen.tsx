import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type TextInputSelectionChangeEventData,
  type ViewToken,
} from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  goldenWorldAssetKeys,
  requireGoldenWorldBundledModule,
} from '@/entities/media-asset';
import { ChatComposerDock } from '../components/ChatComposerDock';
import {
  ChatKeyboardScrollView,
  type ChatKeyboardScrollViewRef,
} from '../components/ChatKeyboardScrollView';
import { ChatMediaViewer } from '../components/ChatMediaViewer';
import {
  LiquidGlassSurface,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import {
  clearChatDraft,
  flushChatDraft,
  loadChatDraft,
  scheduleChatDraftSave,
} from '../model/chat-draft-store';
import {
  acknowledgeChatFollowTarget,
  completeChatFollowAtEnd,
  markChatFollowFlushed,
  requestChatFollow,
  shouldFlushChatFollow,
  type ChatFollowIntent,
} from '../model/chat-follow-intent';
import { calculateChatMediaPreviewMetrics } from '../model/chat-media-layout';
import { resolveChatKeyboardGeometry } from '../model/chat-keyboard-ownership';
import type {
  ChatMediaAttachment,
  ChatMessage,
  ChatThread,
  IncomingMediaMessage,
  OutgoingChatMessage,
  OutgoingMediaMessage,
  OutgoingTextMessage,
} from '../model/chat-message';
import {
  areMessagesInSameCluster,
  buildChatTimelineItems,
  formatChatClock,
  formatChatTimelineLabel,
  type ChatTimelineItem,
} from '../model/chat-timeline';
import {
  isAtChatEnd,
  isNearChatEnd,
  resolveChatScrollableEndInset,
  shouldAutoScrollForNewMessage,
  shouldLoadOlderMessages,
} from '../model/chat-scroll-policy';
import {
  EMPTY_RUNTIME_MESSAGES,
  useChatRuntimeStore,
} from '../model/chat-runtime-store';
import type {
  MessageComposerAction,
  MessageConversationCapabilities,
  MessageConversationDetail,
} from '../contracts/messages-contracts';
import {
  presentConversationThread,
  presentTimelineMessage,
} from '../model/message-surface-presenters';
import {
  ChatTransportError,
  createSendChatMediaCommand,
  createSendChatTextCommand,
  MAX_CHAT_TEXT_LENGTH,
  normalizeChatText,
  previewChatMessageTransport,
  type ChatMessageTransport,
  type ChatNetworkState,
} from '../services/chat-message-transport';
import {
  DEFAULT_CHAT_MESSAGE_PAGE_SIZE,
  localChatRepository,
  type ChatRepository,
} from '../services/chat-repository';

const teamEmblem = requireGoldenWorldBundledModule(
  goldenWorldAssetKeys.sets.teamSaoBangArtwork,
);

export type ChatConversationScreenProps = {
  conversationId?: string;
  messageTransport?: ChatMessageTransport;
  repository?: ChatRepository;
};

type ConversationLoadState = 'loading' | 'not-found' | 'ready' | 'unavailable';

const EMPTY_CHAT_MESSAGES: readonly ChatMessage[] = [];
const INITIAL_CHAT_TIMELINE_RENDER_COUNT =
  DEFAULT_CHAT_MESSAGE_PAGE_SIZE * 2 + 1;
const CHAT_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;
const MEDIA_UPLOAD_MIN_VISIBLE_MS = 650;
const MEDIA_UPLOAD_PROGRESS_TICK_MS = 110;

type ConversationData = {
  conversationId: string;
  historyMessages: readonly ChatMessage[];
  nextCursor?: string;
  status: Exclude<ConversationLoadState, 'loading'>;
  surface?: MessageConversationDetail;
  thread?: ChatThread;
};

function waitForMilliseconds(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function lightImpact() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function mergeThreadMessages(
  threadMessages: readonly ChatMessage[],
  localMessages: readonly OutgoingChatMessage[],
) {
  if (localMessages.length === 0) return threadMessages;

  const knownIdentities = new Set<string>();
  for (const message of threadMessages) {
    knownIdentities.add(message.id);
    if (message.direction === 'outgoing' && message.canonicalId) {
      knownIdentities.add(message.canonicalId);
    }
  }
  const uniqueLocalMessages = localMessages.filter((message) => {
    const identities = [message.id, message.canonicalId].filter(
      (value): value is string => Boolean(value),
    );
    if (identities.some((identity) => knownIdentities.has(identity)))
      return false;
    for (const identity of identities) knownIdentities.add(identity);
    return true;
  });

  const trailingMessage = threadMessages[threadMessages.length - 1];
  if (trailingMessage?.kind !== 'typing') {
    return [...threadMessages, ...uniqueLocalMessages];
  }

  return [
    ...threadMessages.slice(0, -1),
    ...uniqueLocalMessages,
    trailingMessage,
  ];
}

function latestTimestampedMessage(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.kind !== 'typing') return message;
  }
  return undefined;
}

function isGroupedWithPrevious(
  messages: readonly ChatMessage[],
  index: number,
) {
  return areMessagesInSameCluster(messages[index - 1], messages[index]);
}

function shouldShowIncomingAvatar(
  messages: readonly ChatMessage[],
  index: number,
) {
  const message = messages[index];
  if (message?.direction !== 'incoming') return false;

  return !areMessagesInSameCluster(message, messages[index + 1]);
}

function isEmojiOnlyMessage(text: string) {
  const value = text.trim();
  return value.length > 0 && value.length <= 8 && !/[A-Za-zÀ-ỹ0-9]/.test(value);
}

export function ChatConversationScreen(props: ChatConversationScreenProps) {
  return (
    <ChatConversationSession
      key={props.conversationId ?? '__missing-conversation__'}
      {...props}
    />
  );
}

function ChatConversationSession({
  conversationId,
  messageTransport = previewChatMessageTransport,
  repository = localChatRepository,
}: ChatConversationScreenProps) {
  const conversationKey = conversationId ?? '';
  const { bottom: bottomInset } = useSafeAreaInsets();
  const keyboardGeometry = useMemo(
    () => resolveChatKeyboardGeometry(bottomInset),
    [bottomInset],
  );
  const chatScrollViewRef = useRef<ChatKeyboardScrollViewRef>(null);
  const isMountedRef = useRef(true);
  const currentConversationRef = useRef(conversationKey);
  const isNearEndRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const previousLatestMessageIdRef = useRef<string | undefined>(undefined);
  const pendingFollowRef = useRef<ChatFollowIntent | undefined>(undefined);
  const followFrameRef = useRef<number | undefined>(undefined);
  const followCorrectionFrameRef = useRef<number | undefined>(undefined);
  const followFlushScheduledRef = useRef(false);
  const queuedFlushInFlightRef = useRef(false);
  const mediaAttemptByMessageRef = useRef(new Map<string, number>());
  const mediaProgressTimersRef = useRef(
    new Map<string, ReturnType<typeof setInterval>>(),
  );
  const [conversationData, setConversationData] = useState<ConversationData>();
  const [loadRetrySequence, setLoadRetrySequence] = useState(0);
  const [loadingOlderConversationId, setLoadingOlderConversationId] =
    useState<string>();
  const [newMessageState, setNewMessageState] = useState({
    conversationId: '',
    count: 0,
  });
  const [networkSnapshot, setNetworkSnapshot] = useState(() => ({
    state: messageTransport.getNetworkState?.() ?? ('online' as const),
    transport: messageTransport,
  }));
  const localMessages = useChatRuntimeStore(
    (state) =>
      state.messagesByConversation[conversationKey] ?? EMPTY_RUNTIME_MESSAGES,
  );
  const readConversation = useChatRuntimeStore(
    (state) => state.readConversationIds[conversationKey],
  );
  const enqueueOutgoingMedia = useChatRuntimeStore(
    (state) => state.enqueueOutgoingMedia,
  );
  const enqueueOutgoingText = useChatRuntimeStore(
    (state) => state.enqueueOutgoingText,
  );
  const markConversationRead = useChatRuntimeStore(
    (state) => state.markConversationRead,
  );
  const patchOutgoingMessage = useChatRuntimeStore(
    (state) => state.patchOutgoingMessage,
  );
  const removeOutgoingMessage = useChatRuntimeStore(
    (state) => state.removeOutgoingMessage,
  );

  useEffect(() => {
    const progressTimers = mediaProgressTimersRef.current;
    return () => {
      isMountedRef.current = false;
      if (followFrameRef.current !== undefined) {
        cancelAnimationFrame(followFrameRef.current);
      }
      if (followCorrectionFrameRef.current !== undefined) {
        cancelAnimationFrame(followCorrectionFrameRef.current);
      }
      for (const timer of progressTimers.values()) clearInterval(timer);
      progressTimers.clear();
    };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;

    void (async () => {
      try {
        const conversationResponse =
          await repository.getConversation(conversationId);
        if (!active) return;
        if (!conversationResponse) {
          setConversationData({
            conversationId,
            historyMessages: [],
            status: 'not-found',
          });
          return;
        }
        const pageResponse = await repository.getMessagePage(conversationId);
        if (!active) return;
        const surface = conversationResponse.data;
        const thread = presentConversationThread(
          surface,
          pageResponse.data.items,
        );
        setConversationData({
          conversationId,
          historyMessages: thread.messages,
          nextCursor: pageResponse.data.pageInfo.nextCursor ?? undefined,
          status: 'ready',
          surface,
          thread,
        });
      } catch {
        if (active) {
          setConversationData({
            conversationId,
            historyMessages: [],
            status: 'unavailable',
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [conversationId, loadRetrySequence, repository]);

  useEffect(() => {
    const subscription = messageTransport.subscribeNetworkState?.((state) => {
      setNetworkSnapshot({ state, transport: messageTransport });
    });
    return () => subscription?.remove();
  }, [messageTransport]);

  const activeConversationData =
    conversationData?.conversationId === conversationKey
      ? conversationData
      : undefined;
  const loadState: ConversationLoadState = !conversationId
    ? 'not-found'
    : (activeConversationData?.status ?? 'loading');
  const surface = activeConversationData?.surface;
  const thread = activeConversationData?.thread;
  const historyMessages =
    activeConversationData?.historyMessages ?? EMPTY_CHAT_MESSAGES;
  const nextCursor = activeConversationData?.nextCursor;
  const isLoadingOlder = loadingOlderConversationId === conversationKey;
  const newMessageCount =
    newMessageState.conversationId === conversationKey
      ? newMessageState.count
      : 0;
  const networkState =
    networkSnapshot.transport === messageTransport
      ? networkSnapshot.state
      : (messageTransport.getNetworkState?.() ?? 'online');

  const displayedMessages = useMemo(
    () => mergeThreadMessages(historyMessages, localMessages),
    [historyMessages, localMessages],
  );
  const firstUnreadMessageId = readConversation
    ? undefined
    : thread?.firstUnreadMessageId;
  const timelineItems = useMemo(
    () => buildChatTimelineItems(displayedMessages, firstUnreadMessageId),
    [displayedMessages, firstUnreadMessageId],
  );
  const isReadOnly = surface ? !surface.capabilities.canMessage : true;
  const queuedMessageCount = localMessages.filter(
    (message) => message.deliveryStatus === 'queued',
  ).length;

  const scrollToLatest = useCallback((animated = true) => {
    chatScrollViewRef.current?.scrollToEnd({ animated });
  }, []);

  const requestFollowLatest = useCallback(
    (messageId: string, animated = true, targetLayoutAcknowledged = false) => {
      pendingFollowRef.current = requestChatFollow(pendingFollowRef.current, {
        animated,
        conversationId: conversationKey,
        messageId,
        targetLayoutAcknowledged,
      });
    },
    [conversationKey],
  );

  const flushPendingFollow = useCallback(() => {
    const pending = pendingFollowRef.current;
    if (!shouldFlushChatFollow(pending, conversationKey) || !pending) return;

    scrollToLatest(pending.animated);
    pendingFollowRef.current = markChatFollowFlushed(pending, conversationKey);
  }, [conversationKey, scrollToLatest]);

  const cancelScheduledFollow = useCallback(() => {
    if (followFrameRef.current !== undefined) {
      cancelAnimationFrame(followFrameRef.current);
      followFrameRef.current = undefined;
    }
    if (followCorrectionFrameRef.current !== undefined) {
      cancelAnimationFrame(followCorrectionFrameRef.current);
      followCorrectionFrameRef.current = undefined;
    }
    followFlushScheduledRef.current = false;
  }, []);

  const schedulePendingFollow = useCallback(() => {
    if (
      followFlushScheduledRef.current ||
      !shouldFlushChatFollow(pendingFollowRef.current, conversationKey)
    ) {
      return;
    }

    const scheduledConversation = conversationKey;
    followFlushScheduledRef.current = true;
    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = undefined;
      if (
        !isMountedRef.current ||
        currentConversationRef.current !== scheduledConversation
      ) {
        followFlushScheduledRef.current = false;
        return;
      }

      flushPendingFollow();
      followCorrectionFrameRef.current = requestAnimationFrame(() => {
        followCorrectionFrameRef.current = undefined;
        followFlushScheduledRef.current = false;
        if (
          !isMountedRef.current ||
          currentConversationRef.current !== scheduledConversation
        ) {
          return;
        }

        // Fabric can dispatch the target row's onLayout before the native
        // ScrollView has committed its new range. A second, non-animated pass
        // corrects that clamp and is a no-op once onEndVisible/onScroll has
        // already completed the intent.
        flushPendingFollow();
      });
    });
  }, [conversationKey, flushPendingFollow]);

  const handleMessageLayout = useCallback(
    (messageId: string) => {
      pendingFollowRef.current = acknowledgeChatFollowTarget(
        pendingFollowRef.current,
        conversationKey,
        messageId,
      );
      schedulePendingFollow();
    },
    [conversationKey, schedulePendingFollow],
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !conversationId ||
      !nextCursor ||
      isLoadingOlder ||
      loadState !== 'ready'
    ) {
      return;
    }

    const requestedConversation = conversationId;
    const requestedCursor = nextCursor;
    setLoadingOlderConversationId(requestedConversation);
    try {
      const pageResponse = await repository.getMessagePage(
        requestedConversation,
        { cursor: requestedCursor },
      );
      const page = pageResponse.data;
      if (
        !isMountedRef.current ||
        currentConversationRef.current !== requestedConversation
      ) {
        return;
      }
      setConversationData((current) => {
        if (
          !current ||
          current.conversationId !== requestedConversation ||
          current.status !== 'ready'
        ) {
          return current;
        }
        const existing = new Set(
          current.historyMessages.map((message) => message.id),
        );
        return {
          ...current,
          historyMessages: [
            ...page.items
              .map(presentTimelineMessage)
              .filter((message) => !existing.has(message.id)),
            ...current.historyMessages,
          ],
          nextCursor: page.pageInfo.nextCursor ?? undefined,
        };
      });
    } finally {
      if (
        isMountedRef.current &&
        currentConversationRef.current === requestedConversation
      ) {
        setLoadingOlderConversationId((current) =>
          current === requestedConversation ? undefined : current,
        );
      }
    }
  }, [conversationId, isLoadingOlder, loadState, nextCursor, repository]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const endInset = resolveChatScrollableEndInset(
        KeyboardController.state().height,
        keyboardGeometry.scrollOffset,
      );
      const metrics = {
        contentHeight: contentSize.height,
        endInset,
        offsetY: contentOffset.y,
        viewportHeight: layoutMeasurement.height,
      };
      const nearEnd = isNearChatEnd(metrics);
      isNearEndRef.current = nearEnd;
      pendingFollowRef.current = completeChatFollowAtEnd(
        pendingFollowRef.current,
        conversationKey,
        isAtChatEnd(metrics),
      );
      if (nearEnd) {
        setNewMessageState({ conversationId: conversationKey, count: 0 });
      }
      if (
        didInitialScrollRef.current &&
        shouldLoadOlderMessages(
          contentOffset.y,
          Boolean(nextCursor),
          isLoadingOlder,
        )
      ) {
        void loadOlderMessages();
      }
    },
    [
      conversationKey,
      isLoadingOlder,
      keyboardGeometry.scrollOffset,
      loadOlderMessages,
      nextCursor,
    ],
  );

  useLayoutEffect(() => {
    if (loadState !== 'ready') return;
    const latest = latestTimestampedMessage(displayedMessages);
    if (!latest) return;
    const previousId = previousLatestMessageIdRef.current;
    previousLatestMessageIdRef.current = latest.id;
    if (!previousId || previousId === latest.id) return;

    if (
      shouldAutoScrollForNewMessage({
        direction: latest.direction,
        isNearEnd: isNearEndRef.current,
      })
    ) {
      setNewMessageState({ conversationId: conversationKey, count: 0 });
      requestFollowLatest(latest.id, true);
      return;
    }
    setNewMessageState((current) => ({
      conversationId: conversationKey,
      count: current.conversationId === conversationKey ? current.count + 1 : 1,
    }));
  }, [conversationKey, displayedMessages, loadState, requestFollowLatest]);

  const applyDeliveryReceipt = useCallback(
    (
      threadId: string,
      message: OutgoingChatMessage,
      receipt: {
        acceptedAt?: string;
        canonicalMessageId?: string;
        clientMessageId: string;
      },
    ) => {
      if (receipt.clientMessageId !== message.id) {
        throw new Error('Transport receipt does not match the client message.');
      }
      const commonPatch = {
        canonicalId: receipt.canonicalMessageId,
        createdAt: receipt.acceptedAt ?? message.createdAt,
        deliveryStatus: 'sent' as const,
      };
      patchOutgoingMessage(
        threadId,
        message.id,
        message.kind === 'media'
          ? {
              ...commonPatch,
              mediaFailureReason: undefined,
              transferProgress: undefined,
            }
          : commonPatch,
      );
    },
    [patchOutgoingMessage],
  );

  const handleDeliveryFailure = useCallback(
    (threadId: string, message: OutgoingChatMessage, error: unknown) => {
      const isOffline =
        error instanceof ChatTransportError && error.code === 'offline';
      patchOutgoingMessage(threadId, message.id, {
        deliveryStatus: isOffline ? 'queued' : 'failed',
        ...(message.kind === 'media'
          ? {
              mediaFailureReason: isOffline ? undefined : 'send-failed',
              transferProgress: undefined,
            }
          : {}),
      });
    },
    [patchOutgoingMessage],
  );

  const deliverTextMessage = useCallback(
    async (threadId: string, message: OutgoingTextMessage) => {
      try {
        const command = createSendChatTextCommand({
          clientCreatedAt: message.createdAt,
          clientMessageId: message.id,
          conversationId: threadId,
          text: message.text,
        });
        const receipt = await messageTransport.sendText(command);
        applyDeliveryReceipt(threadId, message, receipt);
      } catch (error) {
        handleDeliveryFailure(threadId, message, error);
      }
    },
    [applyDeliveryReceipt, handleDeliveryFailure, messageTransport],
  );

  const clearMediaProgressTimer = useCallback((messageId: string) => {
    const timer = mediaProgressTimersRef.current.get(messageId);
    if (timer) clearInterval(timer);
    mediaProgressTimersRef.current.delete(messageId);
  }, []);

  const deliverMediaMessage = useCallback(
    async (threadId: string, message: OutgoingMediaMessage) => {
      const attempt =
        (mediaAttemptByMessageRef.current.get(message.id) ?? 0) + 1;
      mediaAttemptByMessageRef.current.set(message.id, attempt);
      clearMediaProgressTimer(message.id);

      let progress = 0.06;
      patchOutgoingMessage(threadId, message.id, {
        deliveryStatus: 'sending',
        mediaFailureReason: undefined,
        transferProgress: progress,
      });
      const timer = setInterval(() => {
        if (mediaAttemptByMessageRef.current.get(message.id) !== attempt)
          return;
        progress = Math.min(0.9, progress + 0.07);
        patchOutgoingMessage(threadId, message.id, {
          transferProgress: progress,
        });
      }, MEDIA_UPLOAD_PROGRESS_TICK_MS);
      mediaProgressTimersRef.current.set(message.id, timer);

      try {
        if (!messageTransport.sendMedia) {
          throw new Error('Media transport is not configured.');
        }
        const command = createSendChatMediaCommand({
          caption: message.caption,
          clientCreatedAt: message.createdAt,
          clientMessageId: message.id,
          conversationId: threadId,
          media: message.attachment,
        });
        const [receipt] = await Promise.all([
          messageTransport.sendMedia(command),
          waitForMilliseconds(MEDIA_UPLOAD_MIN_VISIBLE_MS),
        ]);
        if (mediaAttemptByMessageRef.current.get(message.id) !== attempt)
          return;
        clearMediaProgressTimer(message.id);
        applyDeliveryReceipt(threadId, message, receipt);
      } catch (error) {
        if (mediaAttemptByMessageRef.current.get(message.id) !== attempt)
          return;
        clearMediaProgressTimer(message.id);
        handleDeliveryFailure(threadId, message, error);
      }
    },
    [
      applyDeliveryReceipt,
      clearMediaProgressTimer,
      handleDeliveryFailure,
      messageTransport,
      patchOutgoingMessage,
    ],
  );

  useEffect(() => {
    if (
      networkState !== 'online' ||
      queuedFlushInFlightRef.current ||
      !conversationId
    ) {
      return;
    }
    const queued = localMessages.filter(
      (message) => message.deliveryStatus === 'queued',
    );
    if (queued.length === 0) return;

    queuedFlushInFlightRef.current = true;
    void (async () => {
      for (const message of queued) {
        patchOutgoingMessage(conversationId, message.id, {
          deliveryStatus: 'sending',
        });
        if (message.kind === 'media') {
          await deliverMediaMessage(conversationId, message);
        } else {
          await deliverTextMessage(conversationId, message);
        }
      }
    })().finally(() => {
      queuedFlushInFlightRef.current = false;
    });
  }, [
    conversationId,
    deliverMediaMessage,
    deliverTextMessage,
    localMessages,
    networkState,
    patchOutgoingMessage,
  ]);

  const handleSend = useCallback(
    ({
      media,
      text: messageText,
    }: {
      media?: ChatMediaAttachment;
      text: string;
    }) => {
      const text = normalizeChatText(messageText);
      if ((!text && !media) || isReadOnly || !conversationId) return false;

      const createdAt = new Date().toISOString();
      if (media) {
        const message = enqueueOutgoingMedia({
          attachment: media,
          caption: text || undefined,
          conversationId,
          createdAt,
        });
        requestFollowLatest(message.id, true);
        void deliverMediaMessage(conversationId, message);
        return true;
      }

      const message = enqueueOutgoingText({
        createdAt,
        conversationId,
        text,
      });
      requestFollowLatest(message.id, true);
      void deliverTextMessage(conversationId, message);
      return true;
    },
    [
      conversationId,
      deliverMediaMessage,
      deliverTextMessage,
      enqueueOutgoingMedia,
      enqueueOutgoingText,
      isReadOnly,
      requestFollowLatest,
    ],
  );

  const handleCancelMedia = useCallback(
    (message: OutgoingMediaMessage) => {
      if (!conversationId || message.deliveryStatus !== 'sending') return;
      const nextAttempt =
        (mediaAttemptByMessageRef.current.get(message.id) ?? 0) + 1;
      mediaAttemptByMessageRef.current.set(message.id, nextAttempt);
      clearMediaProgressTimer(message.id);
      patchOutgoingMessage(conversationId, message.id, {
        deliveryStatus: 'failed',
        mediaFailureReason: 'cancelled',
        transferProgress: undefined,
      });
    },
    [clearMediaProgressTimer, conversationId, patchOutgoingMessage],
  );

  const handleRemoveMedia = useCallback(
    (message: OutgoingMediaMessage) => {
      if (!conversationId || message.deliveryStatus !== 'failed') return;
      const nextAttempt =
        (mediaAttemptByMessageRef.current.get(message.id) ?? 0) + 1;
      mediaAttemptByMessageRef.current.set(message.id, nextAttempt);
      clearMediaProgressTimer(message.id);
      removeOutgoingMessage(conversationId, message.id);
    },
    [clearMediaProgressTimer, conversationId, removeOutgoingMessage],
  );

  const handleRetry = useCallback(
    (message: OutgoingChatMessage) => {
      if (message.deliveryStatus !== 'failed' || !conversationId) return;
      lightImpact();
      patchOutgoingMessage(conversationId, message.id, {
        deliveryStatus: 'sending',
        ...(message.kind === 'media'
          ? { mediaFailureReason: undefined, transferProgress: 0 }
          : {}),
      });
      if (message.kind === 'media') {
        void deliverMediaMessage(conversationId, message);
        return;
      }
      void deliverTextMessage(conversationId, message);
    },
    [
      conversationId,
      deliverMediaMessage,
      deliverTextMessage,
      patchOutgoingMessage,
    ],
  );

  const unreadMessageIndex = firstUnreadMessageId
    ? displayedMessages.findIndex(
        (message) => message.id === firstUnreadMessageId,
      )
    : -1;
  const unreadMessageIndexRef = useRef(-1);
  const markConversationReadRef = useRef(markConversationRead);

  useEffect(() => {
    unreadMessageIndexRef.current = unreadMessageIndex;
    markConversationReadRef.current = markConversationRead;
  }, [markConversationRead, unreadMessageIndex]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatTimelineItem>[] }) => {
      const firstUnreadIndex = unreadMessageIndexRef.current;
      const activeConversation = currentConversationRef.current;
      if (!activeConversation) return;

      if (firstUnreadIndex >= 0 && AppState.currentState === 'active') {
        const unreadVisible = viewableItems.some(
          ({ isViewable, item }) =>
            isViewable &&
            item.kind === 'message' &&
            item.messageIndex >= firstUnreadIndex,
        );
        if (unreadVisible) {
          markConversationReadRef.current(activeConversation);
        }
      }
    },
    [],
  );

  const handleContentSizeChange = useCallback(() => {
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToLatest(false);
      return;
    }
    schedulePendingFollow();
  }, [schedulePendingFollow, scrollToLatest]);

  const handleMessageListLayout = useCallback(() => {
    if (!didInitialScrollRef.current) {
      scrollToLatest(false);
      return;
    }
    schedulePendingFollow();
  }, [schedulePendingFollow, scrollToLatest]);

  const handleScrollBeginDrag = useCallback(() => {
    pendingFollowRef.current = undefined;
    cancelScheduledFollow();
  }, [cancelScheduledFollow]);

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatKeyboardScrollView
        {...props}
        bottomOffset={keyboardGeometry.scrollOffset}
        chatScrollViewRef={chatScrollViewRef}
      />
    ),
    [keyboardGeometry.scrollOffset],
  );

  if (loadState !== 'ready' || !thread || !surface) {
    return (
      <ConversationStateScreen
        onRetry={
          loadState === 'unavailable'
            ? () => {
                setConversationData(undefined);
                setLoadRetrySequence((current) => current + 1);
              }
            : undefined
        }
        state={loadState}
      />
    );
  }

  return (
    <LiquidScreen
      contentContainerStyle={styles.screenContent}
      scroll={false}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View pointerEvents="none" style={styles.ambientPurple} />
      <View pointerEvents="none" style={styles.ambientCyan} />
      <ChatHeader surface={surface} thread={thread} />
      <ChatNetworkBanner
        networkState={networkState}
        queuedMessageCount={queuedMessageCount}
      />
      <View style={styles.messageViewport} testID="chat-message-viewport">
        <FlatList
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={styles.messageContent}
          data={timelineItems}
          initialNumToRender={INITIAL_CHAT_TIMELINE_RENDER_COUNT}
          keyExtractor={(item) => item.id}
          keyboardDismissMode={
            Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            isLoadingOlder ? (
              <Text
                accessibilityLabel="Đang tải tin nhắn cũ"
                style={styles.loadingOlderText}
              >
                Đang tải tin nhắn cũ…
              </Text>
            ) : null
          }
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleMessageListLayout}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onViewableItemsChanged={handleViewableItemsChanged}
          renderItem={({ item }) => {
            if (item.kind === 'separator') {
              return <ChatTimelineSeparator createdAt={item.createdAt} />;
            }
            if (item.kind === 'time-gap') {
              return <ChatTimeGap createdAt={item.createdAt} />;
            }
            if (item.kind === 'unread-marker') {
              return <ChatUnreadMarker />;
            }

            const { message, messageIndex } = item;
            return (
              <View
                onLayout={() => handleMessageLayout(message.id)}
                style={
                  messageIndex === 0 ||
                  !isGroupedWithPrevious(displayedMessages, messageIndex)
                    ? styles.messageSpacingLoose
                    : styles.messageSpacingTight
                }
                testID={`chat-message-row-${message.id}`}
              >
                <ChatMessageRow
                  message={message}
                  onCancelMedia={handleCancelMedia}
                  onRemoveMedia={handleRemoveMedia}
                  onRetry={handleRetry}
                  showAvatar={shouldShowIncomingAvatar(
                    displayedMessages,
                    messageIndex,
                  )}
                  thread={thread}
                />
              </View>
            );
          }}
          renderScrollComponent={renderScrollComponent}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.messageScroller}
          testID="chat-message-list"
          viewabilityConfig={CHAT_VIEWABILITY_CONFIG}
        />
        {newMessageCount > 0 ? (
          <Pressable
            accessibilityLabel={`${newMessageCount} tin nhắn mới`}
            accessibilityRole="button"
            onPress={() => {
              setNewMessageState({
                conversationId: conversationKey,
                count: 0,
              });
              const latest = latestTimestampedMessage(displayedMessages);
              if (latest) requestFollowLatest(latest.id, true, true);
              schedulePendingFollow();
            }}
            style={({ pressed }) => [
              styles.newMessagePill,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color="#FFFFFF" name="arrow-down" size={14} />
            <Text style={styles.newMessagePillText}>
              {newMessageCount} tin nhắn mới
            </Text>
          </Pressable>
        ) : null}
        <LinearGradient
          colors={['rgba(3,7,17,0.98)', 'rgba(3,7,17,0)']}
          pointerEvents="none"
          style={styles.messageTopScrim}
        />
      </View>
      <ChatComposerDock bottomInset={keyboardGeometry.bottomInset}>
        {isReadOnly ? (
          <ReadOnlyComposer reason={surface.composer.disabledReason} />
        ) : (
          <ChatComposer
            key={conversationKey}
            capabilities={surface.capabilities}
            conversationId={conversationKey}
            placeholder={surface.composer.placeholder}
            onFocus={() => {
              if (isNearEndRef.current) scrollToLatest(true);
            }}
            onSend={handleSend}
          />
        )}
      </ChatComposerDock>
    </LiquidScreen>
  );
}

function ChatNetworkBanner({
  networkState,
  queuedMessageCount,
}: {
  networkState: ChatNetworkState;
  queuedMessageCount: number;
}) {
  if (networkState === 'online' && queuedMessageCount === 0) return null;

  const offline = networkState === 'offline';
  const label = offline
    ? queuedMessageCount > 0
      ? `Ngoại tuyến · ${queuedMessageCount} tin sẽ tự gửi khi có mạng`
      : 'Ngoại tuyến · Tin mới sẽ được xếp hàng'
    : `Đang gửi lại ${queuedMessageCount} tin nhắn`;

  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.networkBanner}
    >
      <Ionicons
        color={offline ? 'rgba(255,190,112,0.88)' : 'rgba(115,219,255,0.86)'}
        name={offline ? 'cloud-offline-outline' : 'sync-outline'}
        size={14}
      />
      <Text style={styles.networkBannerText}>{label}</Text>
    </View>
  );
}

function ConversationStateScreen({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: ConversationLoadState;
}) {
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(appRoutes.main.messages);
  };
  const title =
    state === 'loading'
      ? 'Đang tải cuộc trò chuyện…'
      : state === 'not-found'
        ? 'Không tìm thấy cuộc trò chuyện'
        : 'Không thể tải cuộc trò chuyện';
  const description =
    state === 'not-found'
      ? 'Liên kết có thể đã hết hạn hoặc cuộc trò chuyện không còn tồn tại.'
      : state === 'unavailable'
        ? 'Vui lòng quay lại danh sách và thử lại sau.'
        : 'Đang chuẩn bị lịch sử tin nhắn.';

  return (
    <LiquidScreen
      scroll={false}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.conversationStateHeader}>
        <LiquidOrbButton
          accessibilityLabel="Quay lại danh sách tin nhắn"
          glassIntensity="low"
          glowIntensity="low"
          onPress={goBack}
          size={34}
        >
          <Ionicons
            color="rgba(244,247,255,0.88)"
            name="chevron-back"
            size={18}
          />
        </LiquidOrbButton>
      </View>
      <View accessibilityLabel={title} style={styles.conversationStateBody}>
        <Ionicons
          color="rgba(205,184,255,0.72)"
          name={state === 'loading' ? 'chatbubble-ellipses' : 'alert-circle'}
          size={34}
        />
        <Text style={styles.conversationStateTitle}>{title}</Text>
        <Text style={styles.conversationStateDescription}>{description}</Text>
        {onRetry ? (
          <Pressable
            accessibilityLabel="Thử tải lại cuộc trò chuyện"
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.conversationStateRetry,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color="rgba(238,230,255,0.86)" name="refresh" size={15} />
            <Text style={styles.conversationStateRetryText}>Thử lại</Text>
          </Pressable>
        ) : null}
      </View>
    </LiquidScreen>
  );
}

function ChatTimeGap({ createdAt }: { createdAt: string }) {
  const label = formatChatClock(createdAt);
  if (!label) return null;

  return (
    <View
      accessibilityLabel={`Cách quãng một giờ, tiếp tục lúc ${label}`}
      accessible
      style={styles.timeGap}
    >
      <View style={styles.timeGapDot} />
      <Text style={styles.timeGapText}>{label}</Text>
      <View style={styles.timeGapDot} />
    </View>
  );
}

function ChatUnreadMarker() {
  return (
    <View
      accessibilityLabel="Tin nhắn chưa đọc"
      accessible
      style={styles.unreadMarker}
    >
      <View style={styles.unreadMarkerRule} />
      <Text style={styles.unreadMarkerText}>Tin nhắn chưa đọc</Text>
      <View style={styles.unreadMarkerRule} />
    </View>
  );
}

function ChatTimelineSeparator({ createdAt }: { createdAt: string }) {
  const label = formatChatTimelineLabel(createdAt);
  if (!label) return null;

  return (
    <View
      accessibilityLabel={`Mốc thời gian ${label}`}
      accessible
      style={styles.timelineSeparator}
    >
      <View style={styles.timelineRule} />
      <Text style={styles.timelineLabel}>{label}</Text>
      <View style={styles.timelineRule} />
    </View>
  );
}

function ChatHeader({
  surface,
  thread,
}: {
  surface: MessageConversationDetail;
  thread: ChatThread;
}) {
  const goBack = () => {
    selectionImpact();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(appRoutes.main.messages);
  };

  return (
    <View style={styles.header}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại danh sách tin nhắn"
        glassIntensity="low"
        glowIntensity="low"
        onPress={goBack}
        size={34}
      >
        <Ionicons
          color="rgba(244,247,255,0.88)"
          name="chevron-back"
          size={18}
        />
      </LiquidOrbButton>

      <View style={styles.headerIdentity}>
        <Avatar
          avatar={thread.avatar}
          icon={thread.icon}
          online={thread.isOnline}
          size={46}
        />
        <View style={styles.headerCopy}>
          <View style={styles.headerNameLine}>
            <Text numberOfLines={1} style={styles.headerName}>
              {thread.name}
            </Text>
            {thread.kind !== 'Bạn bè' ? (
              <View style={styles.relationshipTag}>
                <Text style={styles.relationshipText}>
                  {thread.kind === 'Hệ thống' ? 'Thông báo' : thread.kind}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.statusLine}>
            <Text numberOfLines={1} style={styles.statusText}>
              {thread.status}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.headerActions}>
        {surface.capabilities.canCall ? (
          <LiquidOrbButton
            accessibilityLabel={`Gọi cho ${thread.name}`}
            glassIntensity="low"
            glowIntensity="low"
            onPress={lightImpact}
            size={34}
          >
            <Ionicons
              color="rgba(232,238,255,0.72)"
              name="call-outline"
              size={17}
            />
          </LiquidOrbButton>
        ) : null}
        <LiquidOrbButton
          accessibilityLabel={`Tuỳ chọn cuộc trò chuyện với ${thread.name}`}
          glassIntensity="low"
          glowIntensity="low"
          onPress={selectionImpact}
          size={34}
        >
          <Ionicons
            color="rgba(232,238,255,0.68)"
            name="ellipsis-horizontal"
            size={17}
          />
        </LiquidOrbButton>
      </View>
      <View pointerEvents="none" style={styles.headerDivider} />
    </View>
  );
}

function ChatMessageRow({
  message,
  onCancelMedia,
  onRemoveMedia,
  onRetry,
  showAvatar,
  thread,
}: {
  message: ChatMessage;
  onCancelMedia: (message: OutgoingMediaMessage) => void;
  onRemoveMedia: (message: OutgoingMediaMessage) => void;
  onRetry: (message: OutgoingChatMessage) => void;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  if (message.kind === 'typing') {
    return <TypingMessage showAvatar={showAvatar} thread={thread} />;
  }

  if (message.kind === 'team-invite') {
    return (
      <TeamInviteMessage
        message={message}
        showAvatar={showAvatar}
        thread={thread}
      />
    );
  }

  if (message.kind === 'build-share') {
    return (
      <BuildShareMessage
        message={message}
        showAvatar={showAvatar}
        thread={thread}
      />
    );
  }

  if (message.direction === 'outgoing') {
    return message.kind === 'media' ? (
      <OutgoingMediaMessageBubble
        message={message}
        onCancel={onCancelMedia}
        onRemove={onRemoveMedia}
        onRetry={onRetry}
      />
    ) : (
      <OutgoingMessage message={message} onRetry={onRetry} />
    );
  }

  if (message.kind === 'media') {
    return (
      <IncomingMediaMessageBubble
        message={message}
        showAvatar={showAvatar}
        thread={thread}
      />
    );
  }

  return (
    <IncomingMessage
      message={message}
      showAvatar={showAvatar}
      thread={thread}
    />
  );
}

function IncomingMessage({
  message,
  showAvatar,
  thread,
}: {
  message: Extract<ChatMessage, { kind: 'text' }>;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={styles.incomingBubble}>
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
    </View>
  );
}

function OutgoingMessage({
  message,
  onRetry,
}: {
  message: OutgoingTextMessage;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const emojiOnly = isEmojiOnlyMessage(message.text);

  return (
    <View style={styles.outgoingRow}>
      <LinearGradient
        colors={[
          'rgba(76,42,137,0.72)',
          'rgba(12,20,41,0.94)',
          'rgba(17,65,101,0.68)',
        ]}
        end={{ x: 1, y: 0.9 }}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0.1 }}
        style={[
          styles.outgoingBubble,
          emojiOnly && styles.outgoingEmojiBubble,
          message.deliveryStatus === 'failed' && styles.outgoingBubbleFailed,
        ]}
      >
        {emojiOnly ? (
          <View style={styles.outgoingEmojiRow}>
            <Text style={styles.emojiMessageText}>{message.text}</Text>
            <MessageDeliveryMeta compact message={message} onRetry={onRetry} />
          </View>
        ) : (
          <>
            <Text style={styles.messageText}>{message.text}</Text>
            <MessageDeliveryMeta message={message} onRetry={onRetry} />
          </>
        )}
      </LinearGradient>
    </View>
  );
}

function IncomingMediaMessageBubble({
  message,
  showAvatar,
  thread,
}: {
  message: IncomingMediaMessage;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  const viewport = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(
    message.attachment.mediaType === 'image',
  );
  const preview = useMemo(
    () =>
      calculateChatMediaPreviewMetrics({
        mediaHeight: message.attachment.height,
        mediaWidth: message.attachment.width,
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      }),
    [
      message.attachment.height,
      message.attachment.width,
      viewport.height,
      viewport.width,
    ],
  );
  const isVideo = message.attachment.mediaType === 'video';
  const mediaLabel = `${isVideo ? 'Video' : 'Ảnh'} nhận được${
    message.caption ? `, chú thích: ${message.caption}` : ''
  }, lúc ${formatChatClock(message.createdAt)}`;

  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={[styles.mediaMessageShell, { width: preview.width }]}>
          <Pressable
            accessibilityLabel={mediaLabel}
            accessibilityRole="imagebutton"
            onPress={() => setViewerOpen(true)}
            style={({ pressed }) => [
              styles.mediaPreview,
              { height: preview.height, width: preview.width },
              pressed && styles.mediaPreviewPressed,
            ]}
          >
            {message.attachment.thumbnailUri ? (
              <Image
                blurRadius={isVideo ? 0 : 5}
                resizeMode="cover"
                source={{ uri: message.attachment.thumbnailUri }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {isVideo ? (
              <View style={styles.mediaVideoPreview}>
                <Ionicons
                  color="rgba(255,255,255,0.92)"
                  name="play-circle"
                  size={42}
                />
                {message.attachment.durationMs ? (
                  <Text style={styles.mediaDuration}>
                    {formatMediaDuration(message.attachment.durationMs)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Image
                accessibilityIgnoresInvertColors
                fadeDuration={120}
                onLoadEnd={() => setImageLoading(false)}
                onLoadStart={() => setImageLoading(true)}
                resizeMode={preview.resizeMode}
                source={{ uri: message.attachment.uri }}
                style={StyleSheet.absoluteFill}
              />
            )}
            {imageLoading && !isVideo ? (
              <View pointerEvents="none" style={styles.mediaLoadingOverlay}>
                <ActivityIndicator
                  color="rgba(242,246,255,0.72)"
                  size="small"
                />
              </View>
            ) : null}
          </Pressable>
          {message.caption ? (
            <View style={styles.mediaCaptionSurface}>
              <Text style={styles.mediaCaptionText}>{message.caption}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
      {viewerOpen ? (
        <ChatMediaViewer
          attachment={message.attachment}
          caption={message.caption}
          createdAt={message.createdAt}
          onClose={() => setViewerOpen(false)}
          visible
        />
      ) : null}
    </View>
  );
}

function OutgoingMediaMessageBubble({
  message,
  onCancel,
  onRemove,
  onRetry,
}: {
  message: OutgoingMediaMessage;
  onCancel: (message: OutgoingMediaMessage) => void;
  onRemove: (message: OutgoingMediaMessage) => void;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const viewport = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(
    message.attachment.mediaType === 'image',
  );
  const preview = useMemo(
    () =>
      calculateChatMediaPreviewMetrics({
        mediaHeight: message.attachment.height,
        mediaWidth: message.attachment.width,
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      }),
    [
      message.attachment.height,
      message.attachment.width,
      viewport.height,
      viewport.width,
    ],
  );
  const isVideo = message.attachment.mediaType === 'video';
  const hasCaption = Boolean(message.caption);
  const mediaLabel = `${isVideo ? 'Video' : 'Ảnh'} do bạn gửi${
    message.caption ? `, chú thích: ${message.caption}` : ''
  }, lúc ${formatChatClock(message.createdAt)}`;

  return (
    <View style={styles.outgoingRow}>
      <View
        style={[
          styles.mediaMessageShell,
          { width: preview.width },
          message.deliveryStatus === 'failed' && styles.mediaMessageShellFailed,
        ]}
      >
        <Pressable
          accessibilityLabel={mediaLabel}
          accessibilityRole="imagebutton"
          onPress={() => setViewerOpen(true)}
          style={({ pressed }) => [
            styles.mediaPreview,
            { height: preview.height, width: preview.width },
            pressed && styles.mediaPreviewPressed,
          ]}
        >
          {message.attachment.thumbnailUri ? (
            <Image
              blurRadius={5}
              resizeMode="cover"
              source={{ uri: message.attachment.thumbnailUri }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {isVideo ? (
            <View style={styles.mediaVideoPreview}>
              <Ionicons
                color="rgba(255,255,255,0.92)"
                name="play-circle"
                size={42}
              />
              {message.attachment.durationMs ? (
                <Text style={styles.mediaDuration}>
                  {formatMediaDuration(message.attachment.durationMs)}
                </Text>
              ) : null}
            </View>
          ) : (
            <Image
              accessibilityIgnoresInvertColors
              fadeDuration={120}
              onLoadEnd={() => setImageLoading(false)}
              onLoadStart={() => setImageLoading(true)}
              resizeMode={preview.resizeMode}
              source={{ uri: message.attachment.uri }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {imageLoading && !isVideo ? (
            <View pointerEvents="none" style={styles.mediaLoadingOverlay}>
              <ActivityIndicator color="rgba(242,246,255,0.72)" size="small" />
            </View>
          ) : null}

          {message.deliveryStatus === 'sending' ? (
            <MediaUploadingOverlay message={message} onCancel={onCancel} />
          ) : null}
          {message.deliveryStatus === 'queued' ? (
            <View style={styles.mediaStateOverlay}>
              <Ionicons
                color="rgba(255,220,164,0.92)"
                name="cloud-offline-outline"
                size={21}
              />
              <Text style={styles.mediaStateTitle}>Đang chờ mạng</Text>
              <Text style={styles.mediaStateText}>
                Ảnh sẽ tự gửi khi kết nối trở lại.
              </Text>
            </View>
          ) : null}
          {message.deliveryStatus === 'failed' ? (
            <MediaFailedOverlay
              message={message}
              onRemove={onRemove}
              onRetry={onRetry}
            />
          ) : null}

          {!hasCaption &&
          message.deliveryStatus !== 'sending' &&
          message.deliveryStatus !== 'failed' ? (
            <View style={styles.mediaMetaOverlay}>
              <MediaDeliveryMeta message={message} />
            </View>
          ) : null}
        </Pressable>

        {hasCaption ? (
          <View style={styles.mediaCaptionSurface}>
            <Text style={styles.mediaCaptionText}>{message.caption}</Text>
            <MediaDeliveryMeta message={message} />
          </View>
        ) : null}
      </View>

      {viewerOpen ? (
        <ChatMediaViewer
          attachment={message.attachment}
          caption={message.caption}
          createdAt={message.createdAt}
          onClose={() => setViewerOpen(false)}
          visible
        />
      ) : null}
    </View>
  );
}

function formatMediaDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function MediaDeliveryMeta({ message }: { message: OutgoingMediaMessage }) {
  const visual = deliveryVisual(message);
  return (
    <View
      accessibilityLabel={`${formatChatClock(message.createdAt)}, ${visual.label}`}
      accessible
      style={styles.mediaDeliveryMeta}
    >
      <Text style={styles.mediaDeliveryTime}>
        {formatChatClock(message.createdAt)}
      </Text>
      <Ionicons color={visual.color} name={visual.icon} size={13} />
    </View>
  );
}

function MediaUploadingOverlay({
  message,
  onCancel,
}: {
  message: OutgoingMediaMessage;
  onCancel: (message: OutgoingMediaMessage) => void;
}) {
  const progress = Math.round(
    Math.min(1, Math.max(0, message.transferProgress ?? 0)) * 100,
  );
  return (
    <View style={styles.mediaStateOverlay}>
      <ActivityIndicator color="#FFFFFF" size="small" />
      <Text style={styles.mediaStateTitle}>Đang tải lên {progress}%</Text>
      <View style={styles.mediaProgressTrack}>
        <View style={[styles.mediaProgressValue, { width: `${progress}%` }]} />
      </View>
      <Pressable
        accessibilityLabel="Hủy gửi media"
        accessibilityRole="button"
        onPress={(event) => {
          event.stopPropagation();
          onCancel(message);
        }}
        style={({ pressed }) => [
          styles.mediaOverlayAction,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color="#FFFFFF" name="close" size={14} />
        <Text style={styles.mediaOverlayActionText}>Hủy</Text>
      </Pressable>
    </View>
  );
}

function MediaFailedOverlay({
  message,
  onRemove,
  onRetry,
}: {
  message: OutgoingMediaMessage;
  onRemove: (message: OutgoingMediaMessage) => void;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const wasCancelled = message.mediaFailureReason === 'cancelled';
  return (
    <View style={[styles.mediaStateOverlay, styles.mediaFailedOverlay]}>
      <Ionicons
        color="rgba(255,178,187,0.96)"
        name={wasCancelled ? 'close-circle-outline' : 'alert-circle-outline'}
        size={22}
      />
      <Text style={styles.mediaStateTitle}>
        {wasCancelled ? 'Đã hủy tải lên' : 'Không thể gửi'}
      </Text>
      <View style={styles.mediaFailedActions}>
        <Pressable
          accessibilityLabel="Thử lại media"
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onRetry(message);
          }}
          style={({ pressed }) => [
            styles.mediaOverlayAction,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color="#FFFFFF" name="refresh" size={14} />
          <Text style={styles.mediaOverlayActionText}>Thử lại</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Xóa media khỏi cuộc trò chuyện"
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onRemove(message);
          }}
          style={({ pressed }) => [
            styles.mediaOverlayAction,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color="#FFFFFF" name="trash-outline" size={14} />
          <Text style={styles.mediaOverlayActionText}>Xóa</Text>
        </Pressable>
      </View>
    </View>
  );
}

type DeliveryVisual = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function deliveryVisual(message: OutgoingChatMessage): DeliveryVisual {
  switch (message.deliveryStatus) {
    case 'queued':
      return {
        color: 'rgba(255,190,112,0.82)',
        icon: 'cloud-offline-outline',
        label: 'Đang chờ mạng',
      };
    case 'sending':
      return {
        color: 'rgba(198,208,235,0.48)',
        icon: 'time-outline',
        label: 'Đang gửi',
      };
    case 'sent':
      return {
        color: 'rgba(198,208,235,0.54)',
        icon: 'checkmark',
        label: 'Đã gửi',
      };
    case 'delivered':
      return {
        color: 'rgba(180,196,232,0.72)',
        icon: 'checkmark-done',
        label: 'Đã nhận',
      };
    case 'read':
      return {
        color: 'rgba(111,151,255,0.92)',
        icon: 'checkmark-done',
        label: 'Đã đọc',
      };
    case 'failed':
      return {
        color: 'rgba(255,139,150,0.88)',
        icon: 'alert-circle-outline',
        label: 'Không gửi được',
      };
  }
}

function MessageDeliveryMeta({
  compact = false,
  message,
  onRetry,
}: {
  compact?: boolean;
  message: OutgoingChatMessage;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const visual = deliveryVisual(message);

  if (message.deliveryStatus === 'failed') {
    return (
      <View style={[styles.outgoingMeta, styles.outgoingMetaFailed]}>
        <View
          accessibilityLabel={visual.label}
          accessible
          style={styles.deliveryState}
        >
          <Ionicons color={visual.color} name={visual.icon} size={14} />
          <Text style={styles.outgoingFailureText}>{visual.label}</Text>
        </View>
        <Pressable
          accessibilityLabel="Gửi lại tin nhắn"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onRetry(message)}
          style={({ pressed }) => [
            styles.retryAction,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color="rgba(255,190,196,0.90)" name="refresh" size={13} />
          <Text style={styles.retryActionText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.outgoingMeta, compact && styles.outgoingMetaCompact]}>
      <Text style={styles.outgoingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
      <View accessibilityLabel={visual.label} accessible>
        <Ionicons color={visual.color} name={visual.icon} size={14} />
      </View>
    </View>
  );
}

function TeamInviteMessage({
  message,
  showAvatar,
  thread,
}: {
  message: Extract<ChatMessage, { kind: 'team-invite' }>;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={styles.teamInviteStack}>
          <View style={styles.incomingBubble}>
            <Text style={styles.messageText}>{message.text}</Text>
          </View>
          <TeamInviteCard message={message} />
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
    </View>
  );
}

function TeamInviteCard({
  message,
}: {
  message: Extract<ChatMessage, { kind: 'team-invite' }>;
}) {
  return (
    <Pressable
      accessibilityLabel={`Xem set ${message.teamName}`}
      accessibilityRole="button"
      onPress={selectionImpact}
      style={({ pressed }) => [
        styles.teamCardPressable,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[
          'rgba(31,20,62,0.96)',
          'rgba(13,20,40,0.98)',
          'rgba(9,38,56,0.92)',
        ]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.teamCard}
        testID="team-invite-card"
      >
        <View pointerEvents="none" style={styles.teamGlow} />
        <View style={styles.teamTopRow}>
          <View style={styles.teamEmblemFrame}>
            <Image source={teamEmblem} style={styles.teamEmblem} />
          </View>
          <View style={styles.teamCopy}>
            <View style={styles.teamTitleRow}>
              <Text numberOfLines={1} style={styles.teamName}>
                {message.teamName}
              </Text>
              <View style={styles.teamCountBadge}>
                <Text style={styles.teamCountText}>{message.teamSize}</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={styles.teamMode}>
              {message.mode}
            </Text>
            <View style={styles.teamNeedRow}>
              <View style={styles.teamNeedChip}>
                <Ionicons
                  color="rgba(255,177,105,0.88)"
                  name="flash-outline"
                  size={11}
                />
                <Text style={styles.teamNeedText}>
                  Cần {message.missingRole}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.teamMembers}>
                {message.members.join(' · ')}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.teamAction}>
          <LinearGradient
            colors={['rgba(137,70,232,0.94)', 'rgba(64,92,185,0.90)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.teamActionText}>Xem set</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function BuildShareMessage({
  message,
  showAvatar,
  thread,
}: {
  message: Extract<ChatMessage, { kind: 'build-share' }>;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={[styles.incomingBubble, styles.buildShareBubble]}>
          <Text style={styles.messageText}>{message.text}</Text>
          <Pressable
            accessibilityLabel={`Xem build ${message.heroName}`}
            accessibilityRole="button"
            onPress={selectionImpact}
            style={({ pressed }) => [
              styles.buildCardPressable,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(35,25,68,0.96)',
                'rgba(12,21,42,0.98)',
                'rgba(10,42,61,0.92)',
              ]}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.buildCard}
            >
              <View style={styles.buildPreviewFrame}>
                <Image source={message.preview} style={styles.buildPreview} />
                <LinearGradient
                  colors={['transparent', 'rgba(6,10,22,0.88)']}
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.buildRoleBadge}>
                  <Image
                    source={message.roleIcon}
                    style={styles.buildRoleIcon}
                  />
                </View>
              </View>
              <View style={styles.buildBody}>
                <Text style={styles.buildEyebrow}>BUILD ĐI RỪNG</Text>
                <Text numberOfLines={1} style={styles.buildTitle}>
                  {message.heroName}
                </Text>
                <Text numberOfLines={2} style={styles.buildSummary}>
                  {message.summary}
                </Text>
                <View style={styles.buildTags}>
                  {message.tags.map((tag) => (
                    <View key={tag} style={styles.buildTag}>
                      <Text style={styles.buildTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.buildActionLine}>
                  <Text style={styles.buildActionText}>Xem build</Text>
                  <Ionicons
                    color="rgba(194,170,255,0.84)"
                    name="arrow-forward"
                    size={14}
                  />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
    </View>
  );
}

function IncomingAvatar({
  show,
  thread,
}: {
  show: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.messageAvatarSlot}>
      {show ? (
        <Avatar avatar={thread.avatar} icon={thread.icon} size={30} />
      ) : null}
    </View>
  );
}

function TypingMessage({
  showAvatar,
  thread,
}: {
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View
      accessibilityLabel={`${thread.name} đang nhập`}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.incomingRow}
    >
      <IncomingAvatar show={showAvatar} thread={thread} />
      <View style={styles.typingBubble}>
        {[0, 1, 2].map((dot) => (
          <View key={dot} style={styles.typingDot} />
        ))}
      </View>
    </View>
  );
}

function Avatar({
  avatar,
  icon,
  online = false,
  size,
}: {
  avatar?: ImageSourcePropType;
  icon?: keyof typeof Ionicons.glyphMap;
  online?: boolean;
  size: number;
}) {
  return (
    <View
      style={[
        styles.avatarFrame,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      {avatar ? (
        <Image
          source={avatar}
          style={[styles.avatarImage, { borderRadius: size / 2 }]}
        />
      ) : (
        <LinearGradient
          colors={['rgba(123,66,216,0.76)', 'rgba(30,111,166,0.52)']}
          style={[styles.avatarFallback, { borderRadius: size / 2 }]}
        >
          <Ionicons
            color="rgba(244,241,255,0.88)"
            name={icon ?? 'person-outline'}
            size={Math.round(size * 0.42)}
          />
        </LinearGradient>
      )}
      {online ? <View style={styles.avatarOnlineDot} /> : null}
    </View>
  );
}

type ComposerTray = 'attachments' | 'emoji' | 'voice';

const quickEmojis = ['💜', '✨', '🔥', '😂', '👊🏻', 'GG', '🎮', '😎'] as const;

function ChatComposer({
  capabilities,
  conversationId,
  onFocus,
  onSend,
  placeholder,
}: {
  capabilities: MessageConversationCapabilities;
  conversationId: string;
  onFocus: () => void;
  onSend: (submission: {
    media?: ChatMediaAttachment;
    text: string;
  }) => boolean;
  placeholder: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const draft = useChatRuntimeStore(
    (state) => state.draftsByConversation[conversationId] ?? '',
  );
  const draftHydrated = useChatRuntimeStore(
    (state) => state.draftHydratedByConversation[conversationId],
  );
  const hydrateDraft = useChatRuntimeStore((state) => state.hydrateDraft);
  const setRuntimeDraft = useChatRuntimeStore((state) => state.setDraft);
  const clearRuntimeDraft = useChatRuntimeStore((state) => state.clearDraft);
  const [activeTray, setActiveTray] = useState<ComposerTray>();
  const [composerNotice, setComposerNotice] = useState<string>();
  const [selectedMedia, setSelectedMedia] = useState<ChatMediaAttachment>();
  const [selectedMediaPhase, setSelectedMediaPhase] = useState<
    'processing' | 'ready'
  >('ready');
  const mediaProcessingTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const trayTransitionRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [selection, setSelection] = useState(() => ({
    end: draft.length,
    start: draft.length,
  }));
  const didInitializeHydratedSelection = useRef(Boolean(draftHydrated));

  useEffect(() => {
    if (draftHydrated) return;
    let active = true;
    loadChatDraft(conversationId)
      .then((storedDraft) => {
        if (active) hydrateDraft(conversationId, storedDraft);
      })
      .catch(() => {
        if (active) hydrateDraft(conversationId, '');
      });
    return () => {
      active = false;
    };
  }, [conversationId, draftHydrated, hydrateDraft]);

  useEffect(() => {
    if (!draftHydrated || didInitializeHydratedSelection.current) return;
    didInitializeHydratedSelection.current = true;
    setSelection((current) => {
      if (current.start !== 0 || current.end !== 0) return current;
      const cursor = draft.length;
      return { end: cursor, start: cursor };
    });
  }, [draft, draftHydrated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void flushChatDraft(conversationId).catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
      void flushChatDraft(conversationId).catch(() => undefined);
    };
  }, [conversationId]);

  useEffect(() => {
    return () => {
      trayTransitionRef.current += 1;
      if (mediaProcessingTimerRef.current) {
        clearTimeout(mediaProcessingTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (focusRequest === 0 || activeTray !== undefined) return;
    inputRef.current?.focus();
  }, [activeTray, focusRequest]);

  const updateDraft = (nextDraft: string) => {
    setRuntimeDraft(conversationId, nextDraft);
    scheduleChatDraftSave(conversationId, nextDraft);
  };

  const openTray = (tray: ComposerTray) => {
    selectionImpact();
    setComposerNotice(undefined);

    const transition = trayTransitionRef.current + 1;
    trayTransitionRef.current = transition;
    if (activeTray === tray) {
      setActiveTray(undefined);
      return;
    }

    inputRef.current?.blur();
    void KeyboardController.dismiss({ animated: true, keepFocus: false })
      .catch(() => undefined)
      .then(() => {
        if (trayTransitionRef.current !== transition) return;
        setActiveTray(tray);
      });
  };

  const closeTrayAndFocusInput = () => {
    const transition = trayTransitionRef.current + 1;
    trayTransitionRef.current = transition;
    setActiveTray(undefined);
    setFocusRequest(transition);
  };

  const insertEmoji = (emoji: string) => {
    const start = Math.min(selection.start, draft.length);
    const end = Math.min(selection.end, draft.length);
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const cursor = start + emoji.length;
    updateDraft(nextDraft);
    setSelection({ end: cursor, start: cursor });
    selectionImpact();
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => setSelection(event.nativeEvent.selection);

  const chooseMedia = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setComposerNotice('Cần quyền camera để chụp ảnh.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images', 'videos'],
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsMultipleSelection: false,
              mediaTypes: ['images', 'videos'],
              quality: 0.85,
            });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if (mediaProcessingTimerRef.current) {
        clearTimeout(mediaProcessingTimerRef.current);
      }
      setSelectedMedia({
        durationMs: asset.duration ?? undefined,
        fileName: asset.fileName ?? undefined,
        fileSize: asset.fileSize ?? undefined,
        height: asset.height,
        mediaType: asset.type === 'video' ? 'video' : 'image',
        mimeType: asset.mimeType ?? undefined,
        thumbnailUri: asset.type === 'image' ? asset.uri : undefined,
        uri: asset.uri,
        width: asset.width,
      });
      setSelectedMediaPhase('processing');
      setComposerNotice(
        asset.type === 'video' ? 'Đang xử lý video…' : 'Đang xử lý ảnh…',
      );
      setActiveTray(undefined);
      mediaProcessingTimerRef.current = setTimeout(() => {
        setSelectedMediaPhase('ready');
        setComposerNotice(
          asset.type === 'video'
            ? 'Video đã sẵn sàng gửi.'
            : 'Ảnh đã sẵn sàng gửi.',
        );
        mediaProcessingTimerRef.current = undefined;
      }, 320);
    } catch {
      setComposerNotice('Không thể mở trình chọn media lúc này.');
    }
  };

  const send = () => {
    if (!normalizeChatText(draft) && !selectedMedia) return;
    if (selectedMedia && selectedMediaPhase !== 'ready') return;
    if (!onSend({ media: selectedMedia, text: draft })) return;

    lightImpact();
    clearRuntimeDraft(conversationId);
    setSelection({ end: 0, start: 0 });
    setActiveTray(undefined);
    setComposerNotice(undefined);
    setSelectedMedia(undefined);
    setSelectedMediaPhase('ready');
    void clearChatDraft(conversationId).catch(() => undefined);
  };
  const composerActionStates = new Map(
    capabilities.composerActions.map((action) => [action.id, action.state]),
  );
  const actionState = (id: MessageComposerAction['id']) =>
    composerActionStates.get(id) ?? 'hidden';
  const attachmentActionIds: readonly MessageComposerAction['id'][] = [
    'image',
    'camera',
    'team_invite',
    'build_share',
  ];
  const hasVisibleAttachmentAction = attachmentActionIds.some(
    (id) => actionState(id) !== 'hidden',
  );
  const showComingSoonNotice = (label: string) => {
    setComposerNotice(`${label} đang được hoàn thiện.`);
    setActiveTray(undefined);
  };
  const canSend =
    (normalizeChatText(draft).length > 0 || Boolean(selectedMedia)) &&
    (!selectedMedia || selectedMediaPhase === 'ready');

  return (
    <View testID="chat-composer-content">
      {activeTray || composerNotice || selectedMedia ? (
        <View style={styles.composerUtilityArea}>
          {selectedMedia ? (
            <View
              accessibilityLabel={`Media đã chọn: ${
                selectedMedia.mediaType === 'video' ? 'video' : 'ảnh'
              }`}
              accessible
              style={styles.selectedMediaRow}
            >
              <View style={styles.selectedMediaPreviewWrap}>
                {selectedMedia.mediaType === 'image' ? (
                  <Image
                    source={{ uri: selectedMedia.uri }}
                    style={styles.selectedMediaImage}
                  />
                ) : (
                  <View style={styles.selectedMediaVideoIcon}>
                    <Ionicons
                      color="rgba(223,232,255,0.78)"
                      name="videocam"
                      size={18}
                    />
                  </View>
                )}
                {selectedMediaPhase === 'processing' ? (
                  <View style={styles.selectedMediaProcessingOverlay}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  </View>
                ) : null}
              </View>
              <View style={styles.selectedMediaCopy}>
                <Text numberOfLines={1} style={styles.selectedMediaText}>
                  {selectedMedia.fileName ??
                    (selectedMedia.mediaType === 'video'
                      ? 'Video đã chọn'
                      : 'Ảnh đã chọn')}
                </Text>
                <Text style={styles.selectedMediaStatus}>
                  {selectedMediaPhase === 'processing'
                    ? 'Đang xử lý…'
                    : `${selectedMedia.width ?? '?'} × ${selectedMedia.height ?? '?'}`}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Bỏ media đã chọn"
                hitSlop={8}
                onPress={() => {
                  if (mediaProcessingTimerRef.current) {
                    clearTimeout(mediaProcessingTimerRef.current);
                    mediaProcessingTimerRef.current = undefined;
                  }
                  setSelectedMedia(undefined);
                  setSelectedMediaPhase('ready');
                  setComposerNotice(undefined);
                }}
              >
                <Ionicons
                  color="rgba(223,232,255,0.58)"
                  name="close"
                  size={18}
                />
              </Pressable>
            </View>
          ) : null}
          {activeTray === 'attachments' ? (
            <View
              accessibilityLabel="Tuỳ chọn đính kèm"
              style={styles.actionTray}
            >
              {actionState('image') !== 'hidden' ? (
                <ComposerAction
                  icon="images-outline"
                  label="Ảnh/video"
                  onPress={() =>
                    actionState('image') === 'available'
                      ? void chooseMedia('library')
                      : showComingSoonNotice('Chọn ảnh/video')
                  }
                  state={actionState('image')}
                />
              ) : null}
              {actionState('camera') !== 'hidden' ? (
                <ComposerAction
                  icon="camera-outline"
                  label="Camera"
                  onPress={() =>
                    actionState('camera') === 'available'
                      ? void chooseMedia('camera')
                      : showComingSoonNotice('Camera')
                  }
                  state={actionState('camera')}
                />
              ) : null}
              {actionState('team_invite') !== 'hidden' ? (
                <ComposerAction
                  icon="people-outline"
                  label="Mời vào set"
                  onPress={() => showComingSoonNotice('Mời vào set')}
                  state={actionState('team_invite')}
                />
              ) : null}
              {actionState('build_share') !== 'hidden' ? (
                <ComposerAction
                  icon="construct-outline"
                  label="Chia sẻ build"
                  onPress={() => showComingSoonNotice('Chia sẻ build')}
                  state={actionState('build_share')}
                />
              ) : null}
            </View>
          ) : null}
          {activeTray === 'emoji' ? (
            <View accessibilityLabel="Biểu cảm nhanh" style={styles.emojiTray}>
              {quickEmojis.map((emoji) => (
                <Pressable
                  accessibilityLabel={`Chèn ${emoji}`}
                  key={emoji}
                  onPress={() => insertEmoji(emoji)}
                  style={({ pressed }) => [
                    styles.emojiAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emojiActionText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {activeTray === 'voice' ? (
            <View
              accessibilityLabel="Tin nhắn thoại chưa khả dụng"
              accessible
              style={styles.voiceTray}
            >
              <Ionicons
                color="rgba(205,184,255,0.82)"
                name="mic-outline"
                size={18}
              />
              <View style={styles.voiceTrayCopy}>
                <Text style={styles.voiceTrayTitle}>Tin nhắn thoại</Text>
                <Text style={styles.voiceTrayText}>
                  Tính năng ghi âm đang được hoàn thiện.
                </Text>
              </View>
            </View>
          ) : null}
          {composerNotice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.composerNotice}
            >
              {composerNotice}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.composerRow}>
        {hasVisibleAttachmentAction ? (
          <LiquidOrbButton
            accessibilityLabel="Thêm nội dung"
            glassIntensity="low"
            glowIntensity="none"
            onPress={() => openTray('attachments')}
            size={36}
          >
            <Ionicons
              color="rgba(214,222,244,0.60)"
              name={activeTray === 'attachments' ? 'close' : 'add'}
              size={19}
            />
          </LiquidOrbButton>
        ) : null}

        <LiquidGlassSurface
          baseStrokeOpacity={0.05}
          baseStrokeWidth={0.5}
          blurIntensity={20}
          contentStyle={styles.inputSurface}
          glowIntensity="none"
          radius={21}
          style={styles.inputShell}
          surfaceBackground="rgba(9,14,29,0.72)"
          variant="nav"
          withInnerReflection={false}
          withShadow={false}
        >
          <View style={styles.inputTextSlot}>
            <TextInput
              accessibilityHint="Nhấn nút gửi để gửi. Phím Enter tạo dòng mới."
              accessibilityLabel="Nội dung tin nhắn"
              blurOnSubmit={false}
              keyboardAppearance="dark"
              maxLength={MAX_CHAT_TEXT_LENGTH}
              multiline
              onChangeText={updateDraft}
              onBlur={() => {
                void flushChatDraft(conversationId).catch(() => undefined);
              }}
              onFocus={onFocus}
              onSelectionChange={handleSelectionChange}
              placeholder={placeholder}
              placeholderTextColor="rgba(190,201,229,0.52)"
              ref={inputRef}
              scrollEnabled
              testID="chat-composer-input"
              selection={selection}
              style={styles.input}
              value={draft}
            />
            {activeTray ? (
              <Pressable
                accessibilityLabel="Tiếp tục nhập tin nhắn"
                accessibilityRole="button"
                onPress={closeTrayAndFocusInput}
                style={styles.inputFocusHandoff}
                testID="chat-composer-focus-handoff"
              />
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="Chọn biểu cảm"
            accessibilityRole="button"
            accessibilityState={{ expanded: activeTray === 'emoji' }}
            hitSlop={8}
            onPress={() => openTray('emoji')}
          >
            <Ionicons
              color="rgba(205,216,243,0.64)"
              name={activeTray === 'emoji' ? 'close-circle' : 'happy-outline'}
              size={21}
            />
          </Pressable>
        </LiquidGlassSurface>

        {actionState('voice') !== 'hidden' ? (
          <LiquidOrbButton
            accessibilityLabel="Gửi tin nhắn thoại"
            glassIntensity="low"
            glowIntensity="low"
            onPress={() => openTray('voice')}
            size={36}
          >
            <Ionicons
              color="rgba(210,220,244,0.56)"
              name={activeTray === 'voice' ? 'close' : 'mic-outline'}
              size={17}
            />
          </LiquidOrbButton>
        ) : null}

        <Pressable
          accessibilityLabel="Gửi tin nhắn"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
        >
          <LinearGradient
            colors={['rgba(157,77,255,0.98)', 'rgba(57,120,220,0.94)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons color="#FFFFFF" name="paper-plane" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

function ComposerAction({
  icon,
  label,
  onPress,
  state,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  state: MessageComposerAction['state'];
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.composerAction,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.composerActionIcon}>
        <Ionicons color="rgba(214,226,255,0.76)" name={icon} size={18} />
      </View>
      <Text numberOfLines={1} style={styles.composerActionText}>
        {label}
      </Text>
      {state === 'coming_soon' ? (
        <Text style={styles.composerActionState}>Sắp có</Text>
      ) : null}
    </Pressable>
  );
}

function ReadOnlyComposer({ reason }: { reason?: string }) {
  return (
    <View
      accessibilityLabel="Thông báo này không hỗ trợ trả lời"
      accessible
      style={styles.readOnlyComposer}
    >
      <Ionicons
        color="rgba(201,211,238,0.52)"
        name="lock-closed-outline"
        size={17}
      />
      <Text style={styles.readOnlyComposerText}>
        {reason ?? 'Cuộc trò chuyện này không hỗ trợ trả lời'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ambientCyan: {
    backgroundColor: 'rgba(34,183,255,0.016)',
    borderRadius: 999,
    bottom: 70,
    height: 300,
    position: 'absolute',
    right: -245,
    width: 300,
  },
  ambientPurple: {
    backgroundColor: 'rgba(140,72,255,0.028)',
    borderRadius: 999,
    height: 300,
    left: -235,
    position: 'absolute',
    top: -120,
    width: 300,
  },
  avatarFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatarFrame: {
    borderColor: 'rgba(210,169,255,0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    padding: 1.5,
    position: 'relative',
    shadowColor: '#B85DFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
  },
  avatarImage: { height: '100%', opacity: 0.92, width: '100%' },
  avatarOnlineDot: {
    backgroundColor: '#22DCA0',
    borderColor: 'rgba(5,9,21,0.96)',
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: 1,
    height: 11,
    position: 'absolute',
    right: 0,
    width: 11,
  },
  actionTray: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  composerAction: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  composerActionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(118,92,205,0.12)',
    borderColor: 'rgba(185,159,255,0.14)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  composerActionState: {
    color: 'rgba(205,184,255,0.58)',
    fontSize: 8.5,
    fontWeight: '800',
    marginTop: -2,
  },
  composerActionText: {
    color: 'rgba(213,222,246,0.66)',
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  composerNotice: {
    color: 'rgba(206,216,241,0.58)',
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: 'center',
  },
  composerUtilityArea: {
    borderBottomColor: 'rgba(210,224,255,0.04)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 9,
  },
  emojiAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    minWidth: 34,
  },
  emojiActionText: { color: '#FFFFFF', fontSize: 17 },
  emojiTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedMediaCopy: { flex: 1, gap: 2, minWidth: 0 },
  selectedMediaImage: { height: 46, width: 46 },
  selectedMediaPreviewWrap: {
    backgroundColor: 'rgba(5,8,16,0.92)',
    borderRadius: 9,
    height: 46,
    overflow: 'hidden',
    position: 'relative',
    width: 46,
  },
  selectedMediaProcessingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.44)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  selectedMediaRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(13,19,36,0.74)',
    borderColor: 'rgba(170,142,245,0.14)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    padding: 6,
  },
  selectedMediaStatus: {
    color: 'rgba(198,208,235,0.48)',
    fontSize: 9.5,
  },
  selectedMediaText: {
    color: 'rgba(226,232,250,0.72)',
    fontSize: 11,
    fontWeight: '600',
  },
  selectedMediaVideoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(111,91,196,0.16)',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  timeGap: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 5,
    marginTop: 11,
  },
  timeGapDot: {
    backgroundColor: 'rgba(188,199,227,0.18)',
    borderRadius: 999,
    height: 2.5,
    width: 2.5,
  },
  timeGapText: {
    color: 'rgba(188,199,227,0.38)',
    fontSize: 9,
    fontWeight: '600',
  },
  timelineLabel: {
    color: 'rgba(184,195,224,0.46)',
    fontSize: 9.5,
    fontWeight: '600',
  },
  timelineRule: {
    backgroundColor: 'rgba(205,217,246,0.055)',
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  timelineSeparator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
    marginTop: 20,
    paddingHorizontal: 18,
  },
  voiceTray: {
    alignItems: 'center',
    backgroundColor: 'rgba(112,82,190,0.08)',
    borderColor: 'rgba(180,147,255,0.14)',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  voiceTrayCopy: { flex: 1, gap: 2 },
  voiceTrayText: {
    color: 'rgba(198,208,233,0.52)',
    fontSize: 10.2,
    lineHeight: 13,
  },
  voiceTrayTitle: {
    color: 'rgba(232,225,255,0.84)',
    fontSize: 11.5,
    fontWeight: '700',
  },
  composerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 7,
  },
  header: {
    alignItems: 'center',
    backgroundColor: 'rgba(3,7,17,0.94)',
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'relative',
    zIndex: 4,
  },
  headerActions: { flexDirection: 'row', gap: 5 },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  headerDivider: {
    backgroundColor: 'rgba(210,224,255,0.038)',
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: 54,
    position: 'absolute',
    right: 12,
  },
  headerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 8,
    minWidth: 0,
  },
  headerName: {
    color: liquidColors.text.primary,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.22,
  },
  headerNameLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  incomingBlock: { gap: 4 },
  incomingBubble: {
    backgroundColor: 'rgba(15,21,39,0.84)',
    borderColor: 'rgba(194,207,242,0.085)',
    borderRadius: 17,
    borderTopColor: 'rgba(225,232,255,0.13)',
    borderTopLeftRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '76%',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  incomingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
  },
  incomingTime: {
    color: 'rgba(190,200,228,0.40)',
    fontSize: 9.5,
    marginLeft: 37,
  },
  input: {
    color: 'rgba(241,245,255,0.92)',
    flex: 1,
    fontSize: 13.5,
    lineHeight: 18,
    maxHeight: 88,
    minHeight: 22,
    minWidth: 0,
    padding: 0,
    textAlignVertical: 'center',
  },
  inputFocusHandoff: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  inputShell: { flex: 1 },
  inputTextSlot: { flex: 1, minWidth: 0, position: 'relative' },
  inputSurface: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 13,
    paddingVertical: 0,
  },
  messageContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  messageScroller: { flex: 1 },
  messageTopScrim: {
    height: 24,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  networkBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,24,31,0.92)',
    borderBottomColor: 'rgba(255,187,104,0.12)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  networkBannerText: {
    color: 'rgba(228,220,222,0.72)',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageViewport: { flex: 1, overflow: 'hidden' },
  messageAvatarSlot: {
    height: 30,
    justifyContent: 'flex-start',
    marginTop: 5,
    width: 30,
  },
  messageSpacingLoose: { marginTop: 15 },
  messageSpacingTight: { marginTop: 7 },
  messageText: {
    color: 'rgba(238,242,255,0.90)',
    fontSize: 12.7,
    lineHeight: 17,
  },
  mediaCaptionSurface: {
    backgroundColor: 'rgba(9,13,24,0.96)',
    gap: 4,
    paddingBottom: 8,
    paddingHorizontal: 13,
    paddingTop: 9,
  },
  mediaCaptionText: {
    color: 'rgba(242,245,255,0.92)',
    fontSize: 15,
    lineHeight: 20,
  },
  mediaDeliveryMeta: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 3,
  },
  mediaDeliveryTime: {
    color: 'rgba(205,213,235,0.52)',
    fontSize: 9.5,
  },
  mediaDuration: {
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: 999,
    bottom: 9,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: 9,
  },
  mediaFailedActions: { flexDirection: 'row', gap: 8 },
  mediaFailedOverlay: { backgroundColor: 'rgba(30,4,10,0.66)' },
  mediaLoadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,8,16,0.18)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mediaMessageShell: {
    backgroundColor: 'rgba(5,8,15,0.98)',
    borderColor: 'rgba(180,194,229,0.13)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#6B76C8',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  mediaMessageShellFailed: { borderColor: 'rgba(255,118,136,0.34)' },
  mediaMetaOverlay: {
    backgroundColor: 'rgba(0,0,0,0.54)',
    borderRadius: 999,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: 8,
  },
  mediaOverlayAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mediaOverlayActionText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  mediaPreview: {
    backgroundColor: 'rgba(6,9,16,0.98)',
    overflow: 'hidden',
  },
  mediaPreviewPressed: { opacity: 0.92 },
  mediaProgressTrack: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    height: 3,
    overflow: 'hidden',
    width: 112,
  },
  mediaProgressValue: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    height: '100%',
  },
  mediaStateOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,5,12,0.58)',
    bottom: 0,
    gap: 7,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mediaStateText: {
    color: 'rgba(244,246,255,0.68)',
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: 'center',
  },
  mediaStateTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  mediaVideoPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(24,29,48,0.94)',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  outgoingBubble: {
    borderColor: 'rgba(132,119,255,0.22)',
    borderRadius: 17,
    borderBottomRightRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '74%',
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 7,
    shadowColor: '#5B74FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  deliveryState: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  emojiMessageText: { fontSize: 21, lineHeight: 24 },
  outgoingBubbleFailed: { borderColor: 'rgba(255,111,129,0.32)' },
  outgoingEmojiBubble: { paddingHorizontal: 9, paddingVertical: 5 },
  outgoingEmojiRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 7,
  },
  outgoingMeta: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  outgoingFailureText: {
    color: 'rgba(255,155,166,0.88)',
    fontSize: 9.2,
    fontWeight: '700',
  },
  outgoingMetaCompact: { marginTop: 0 },
  outgoingMetaFailed: { gap: 8, marginTop: 4 },
  outgoingRow: { alignItems: 'flex-end' },
  outgoingTime: {
    color: 'rgba(198,208,235,0.46)',
    fontSize: 9.5,
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  retryAction: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  retryActionText: {
    color: 'rgba(255,190,196,0.90)',
    fontSize: 9.2,
    fontWeight: '800',
  },
  readOnlyComposer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  readOnlyComposerText: {
    color: 'rgba(201,211,238,0.58)',
    fontSize: 12.5,
    fontWeight: '600',
  },
  relationshipTag: {
    backgroundColor: 'rgba(145,78,226,0.12)',
    borderColor: 'rgba(204,151,255,0.16)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  relationshipText: {
    color: 'rgba(218,189,255,0.78)',
    fontSize: 9.5,
    fontWeight: '700',
  },
  conversationStateRetry: {
    alignItems: 'center',
    backgroundColor: 'rgba(139,83,220,0.18)',
    borderColor: 'rgba(210,179,255,0.2)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  conversationStateRetryText: {
    color: 'rgba(238,230,255,0.86)',
    fontSize: 12,
    fontWeight: '800',
  },
  conversationStateBody: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  conversationStateDescription: {
    color: 'rgba(190,201,230,0.54)',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  conversationStateHeader: { paddingHorizontal: 12, paddingTop: 7 },
  conversationStateTitle: {
    color: liquidColors.text.primary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingOlderText: {
    color: 'rgba(190,201,230,0.44)',
    fontSize: 10.5,
    paddingVertical: 10,
    textAlign: 'center',
  },
  newMessagePill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(111,72,207,0.94)',
    borderColor: 'rgba(221,207,255,0.20)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 12,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    shadowColor: '#8B5CFF',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  newMessagePillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  unreadMarker: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
    marginTop: 14,
    paddingHorizontal: 18,
  },
  unreadMarkerRule: {
    backgroundColor: 'rgba(167,118,255,0.32)',
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  unreadMarkerText: {
    color: 'rgba(207,181,255,0.82)',
    fontSize: 10,
    fontWeight: '800',
  },
  root: { backgroundColor: liquidColors.background.base, flex: 1 },
  screenContent: { paddingHorizontal: 0, paddingTop: 0 },
  statusLine: { alignItems: 'center', flexDirection: 'row' },
  statusText: {
    color: 'rgba(190,201,230,0.52)',
    flexShrink: 1,
    fontSize: 10.8,
  },
  buildActionLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  buildActionText: {
    color: 'rgba(205,184,255,0.88)',
    fontSize: 10.5,
    fontWeight: '800',
  },
  buildBody: { flex: 1, gap: 3, minWidth: 0, paddingVertical: 8 },
  buildCard: {
    borderColor: 'rgba(151,113,232,0.24)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    minHeight: 112,
    overflow: 'hidden',
    padding: 8,
  },
  buildCardPressable: { borderRadius: 15, marginTop: 8, overflow: 'hidden' },
  buildEyebrow: {
    color: 'rgba(137,205,232,0.66)',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.55,
  },
  buildPreview: { height: '100%', width: '100%' },
  buildPreviewFrame: {
    borderRadius: 11,
    height: 96,
    overflow: 'hidden',
    position: 'relative',
    width: 78,
  },
  buildRoleBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(6,11,25,0.82)',
    borderColor: 'rgba(118,209,236,0.24)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 6,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    width: 24,
  },
  buildRoleIcon: { height: 15, opacity: 0.86, width: 15 },
  buildShareBubble: { maxWidth: '88%', padding: 9 },
  buildSummary: {
    color: 'rgba(196,207,232,0.58)',
    fontSize: 9.8,
    lineHeight: 13,
  },
  buildTag: {
    backgroundColor: 'rgba(137,89,220,0.10)',
    borderColor: 'rgba(180,132,255,0.16)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  buildTagText: {
    color: 'rgba(218,201,246,0.70)',
    fontSize: 8.2,
    fontWeight: '700',
  },
  buildTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  buildTitle: {
    color: 'rgba(247,248,255,0.94)',
    fontSize: 13.5,
    fontWeight: '800',
  },
  teamAction: {
    alignItems: 'center',
    borderColor: 'rgba(199,160,255,0.24)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 32,
    overflow: 'hidden',
  },
  teamActionText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
    zIndex: 2,
  },
  teamCard: {
    borderColor: 'rgba(160,116,235,0.26)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 9,
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
  },
  teamCardPressable: {
    borderRadius: 16,
    marginTop: 7,
    overflow: 'hidden',
    width: '100%',
  },
  teamCopy: { flex: 1, gap: 3, minWidth: 0 },
  teamCountBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(111,91,196,0.16)',
    borderColor: 'rgba(184,151,255,0.22)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  teamCountText: {
    color: 'rgba(221,207,255,0.78)',
    fontSize: 8.5,
    fontWeight: '800',
  },
  teamEmblem: { height: '100%', opacity: 0.92, width: '100%' },
  teamEmblemFrame: {
    borderColor: 'rgba(206,144,255,0.42)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    height: 68,
    overflow: 'hidden',
    padding: 2,
    width: 68,
  },
  teamGlow: {
    backgroundColor: 'rgba(146,63,255,0.08)',
    borderRadius: 999,
    height: 150,
    position: 'absolute',
    right: -82,
    top: -88,
    width: 150,
  },
  teamInviteStack: { flex: 1, maxWidth: '88%', minWidth: 0 },
  teamMembers: {
    color: 'rgba(194,205,233,0.58)',
    flex: 1,
    fontSize: 9.2,
  },
  teamMode: {
    color: 'rgba(194,205,233,0.58)',
    fontSize: 9.5,
  },
  teamName: {
    color: 'rgba(247,248,255,0.96)',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.18,
  },
  teamNeedChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,133,58,0.09)',
    borderColor: 'rgba(255,154,84,0.18)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  teamNeedRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  teamNeedText: {
    color: 'rgba(255,181,120,0.88)',
    fontSize: 8.8,
    fontWeight: '800',
  },
  teamTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  teamTopRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sendButton: {
    alignItems: 'center',
    borderColor: 'rgba(205,168,255,0.42)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#8B5CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    width: 40,
  },
  sendButtonDisabled: { opacity: 0.58, shadowOpacity: 0.08 },
  sendButtonPressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  typingBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,21,39,0.80)',
    borderColor: 'rgba(207,220,255,0.08)',
    borderRadius: 16,
    borderTopLeftRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  typingDot: {
    backgroundColor: 'rgba(151,94,255,0.82)',
    borderRadius: 999,
    height: 5,
    width: 5,
  },
});
