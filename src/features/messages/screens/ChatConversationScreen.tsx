import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  AppState,
  FlatList,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type ViewToken,
} from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appRoutes } from '@/app-shell/navigation/routes';
import { useSocialCommandCoordinator } from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import {
  useAssetResolver,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
import { ChatComposerDock } from '../components/ChatComposerDock';
import {
  ChatKeyboardScrollView,
  type ChatKeyboardScrollViewRef,
} from '../components/ChatKeyboardScrollView';
import { ChatMessageReportModal } from '../components/ChatMessageReportModal';
import { ConversationOptionsModal } from '../components/ConversationOptionsModal';
import { useAuth } from '@/shared/auth/auth-context';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  ConversationIdSchema,
  MessageIdSchema,
  PlayerIdSchema,
} from '@/shared/contracts/core-v1';
import type { ReportCategoryV2 } from '@/shared/contracts/core-v2';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import {
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
} from '@/shared/theme/liqi-design-system';
import { chatConversationStyles as styles } from './chat-conversation.styles';
import {
  authoritativeSequence,
  isGroupedWithPrevious,
  latestAuthoritativeSequence,
  latestTimestampedMessage,
  mergeAuthoritativeMessages,
  mergeThreadMessages,
  shouldShowIncomingAvatar,
} from '../model/chat-conversation-message-merge';
import { lightImpact, selectionImpact } from './chat-conversation-haptics';
import {
  ChatHeader,
  ChatMessageRow,
  ChatNetworkBanner,
  ChatTimeGap,
  ChatTimelineSeparator,
  ChatUnreadMarker,
  ConversationSourceBanner,
  ConversationStateScreen,
} from './chat-conversation-timeline';
import { ChatComposer, ReadOnlyComposer } from './chat-conversation-composer';
import type { ConversationLoadState } from './chat-conversation.types';
import { messagesChatAssets } from './messages-redesign-assets';

import {
  acknowledgeChatFollowTarget,
  completeChatFollowAtEnd,
  markChatFollowFlushed,
  requestChatFollow,
  shouldFlushChatFollow,
  type ChatFollowIntent,
} from '../model/chat-follow-intent';
import { resolveChatKeyboardGeometry } from '../model/chat-keyboard-ownership';
import type {
  ChatMediaAttachment,
  ChatMessage,
  ChatThread,
  OutgoingChatMessage,
  OutgoingMediaMessage,
  OutgoingTextMessage,
} from '../model/chat-message';
import {
  buildChatTimelineItems,
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
import type { MessageConversationDetail } from '../contracts/messages-contracts';
import {
  presentConversationThread,
  presentTimelineMessage,
} from '../model/message-surface-presenters';
import {
  ChatTransportError,
  createSendChatMediaCommand,
  createSendChatTextCommand,
  normalizeChatText,
  type ChatMessageTransport,
} from '../services/chat-message-transport';
import { useMessagesServices } from '../runtime/MessagesServicesProvider';
import {
  DEFAULT_CHAT_MESSAGE_PAGE_SIZE,
  type ChatRepository,
} from '../services/chat-repository';
import { MessageReportEvidenceWorkflow } from '../services/message-report-evidence';

export type ChatConversationScreenProps = {
  conversationId?: string;
  messageReportEvidenceWorkflow?: MessageReportEvidenceWorkflow;
  messageTransport?: ChatMessageTransport;
  repository?: ChatRepository;
};

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

type ReportableMessageTarget = Readonly<{
  conversationId: string;
  messageId: string;
  senderPlayerId: string;
}>;

function reportableMessageTarget(
  message: ChatMessage,
  conversationId: string,
  viewerPlayerId: string | null,
): ReportableMessageTarget | null {
  if (
    message.kind === 'typing' ||
    message.direction !== 'incoming' ||
    !message.senderId ||
    message.senderId === viewerPlayerId
  ) {
    return null;
  }

  const parsedConversationId = ConversationIdSchema.safeParse(conversationId);
  const parsedMessageId = MessageIdSchema.safeParse(message.id);
  const parsedSenderPlayerId = PlayerIdSchema.safeParse(message.senderId);
  if (
    !parsedConversationId.success ||
    !parsedMessageId.success ||
    !parsedSenderPlayerId.success
  ) {
    return null;
  }

  return {
    conversationId: parsedConversationId.data,
    messageId: parsedMessageId.data,
    senderPlayerId: parsedSenderPlayerId.data,
  };
}

function activeReporterPlayerId(session: AuthSession | null) {
  const principal = session?.principal;
  const lifecycle = session?.lifecycle;
  if (
    !principal?.playerId ||
    !lifecycle ||
    session.user.id !== principal.accountId ||
    lifecycle.playerId !== principal.playerId ||
    lifecycle.state !== 'active'
  ) {
    return null;
  }
  const parsed = PlayerIdSchema.safeParse(principal.playerId);
  return parsed.success ? parsed.data : null;
}

function reportMessageErrorMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : null;
  if (code === 'report_evidence_invalid') {
    return 'Tin nhắn không còn khớp với bằng chứng đã lưu của cuộc trò chuyện.';
  }
  if (code === 'report_target_not_found') {
    return 'Tin nhắn không còn tồn tại trong dữ liệu mới nhất.';
  }
  if (code === 'report_self_forbidden') {
    return 'Bạn không thể báo cáo tin nhắn của chính mình.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Vui lòng kiểm tra kết nối và thử lại.';
}

function waitForMilliseconds(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

export function ChatConversationScreen(props: ChatConversationScreenProps) {
  return (
    <ChatConversationSession
      key={props.conversationId ?? '__missing-conversation__'}
      {...props}
    />
  );
}

function ChatConversationSession(props: ChatConversationScreenProps) {
  const services = useMessagesServices();
  const assetResolver = useAssetResolver();
  const { session } = useAuth();
  const reporterPlayerId = activeReporterPlayerId(session);
  const socialCoordinator = useSocialCommandCoordinator();
  const reportEvidenceWorkflow = useMemo(
    () =>
      props.messageReportEvidenceWorkflow ??
      (socialCoordinator && services.evidenceProvider
        ? new MessageReportEvidenceWorkflow(
            socialCoordinator,
            services.evidenceProvider,
          )
        : null),
    [
      props.messageReportEvidenceWorkflow,
      services.evidenceProvider,
      socialCoordinator,
    ],
  );
  usePreloadAssetSurface('messages');
  const conversationId = props.conversationId;
  const messageTransport = props.messageTransport ?? services.messageTransport;
  const repository = props.repository ?? services.repository;
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
  const gapRecoveryInFlightRef = useRef(false);
  const gapRecoveryPendingRef = useRef(false);
  const historyMessagesRef =
    useRef<readonly ChatMessage[]>(EMPTY_CHAT_MESSAGES);
  const lastReadSequenceRequestedRef = useRef(0);
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
  const [messageReportTarget, setMessageReportTarget] =
    useState<ReportableMessageTarget | null>(null);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const reportSubmissionLockedRef = useRef(false);
  const muteConversationMutation = useMutation({
    mutationFn: async (muted: boolean) => {
      if (!conversationId || !services.conversationLifecycle) {
        throw new Error('Conversation notification lifecycle is unavailable.');
      }
      return services.conversationLifecycle.setMuted({
        conversationId,
        muted,
      });
    },
    onError: () => {
      Alert.alert(
        'Chưa cập nhật được thông báo',
        'Dữ liệu vừa thay đổi hoặc kết nối đang gián đoạn. Hãy thử lại.',
      );
    },
    onSuccess: (receipt) => {
      setConversationData((current) =>
        current?.conversationId === receipt.conversationId && current.surface
          ? {
              ...current,
              surface: {
                ...current.surface,
                viewerState: {
                  ...current.surface.viewerState,
                  isMuted: receipt.muted,
                },
              },
            }
          : current,
      );
    },
  });
  const reportMessageMutation = useMutation({
    mutationFn: (category: ReportCategoryV2) => {
      if (
        !session ||
        !reporterPlayerId ||
        !reportEvidenceWorkflow ||
        !messageReportTarget
      ) {
        throw Object.assign(
          new Error('Message report authority is not available.'),
          { code: 'service_unavailable', retryable: true },
        );
      }
      return reportEvidenceWorkflow.submit({
        category,
        conversationId: messageReportTarget.conversationId,
        details: null,
        messageId: messageReportTarget.messageId,
        session,
        targetPlayerId: messageReportTarget.senderPlayerId,
      });
    },
    onError: (error) => {
      Alert.alert('Chưa gửi được báo cáo', reportMessageErrorMessage(error));
    },
    onSettled: () => {
      reportSubmissionLockedRef.current = false;
    },
    onSuccess: (result) => {
      setMessageReportTarget(null);
      if (result.status === 'evidence_pending') {
        Alert.alert(
          'Đã gửi báo cáo',
          result.retryStored
            ? 'Báo cáo đã được ghi nhận. Bằng chứng đang chờ đồng bộ và sẽ tự thử lại khi kết nối ổn định.'
            : 'Báo cáo và bằng chứng máy chủ đã được ghi nhận. Thiết bị chưa lưu được trạng thái xác minh cục bộ.',
        );
        return;
      }
      Alert.alert(
        'Đã gửi báo cáo',
        'Tin nhắn và bằng chứng bất biến đã được ghi nhận để đội an toàn xem xét.',
      );
    },
  });
  const [networkSnapshot, setNetworkSnapshot] = useState(() => ({
    state: messageTransport.getNetworkState?.() ?? ('online' as const),
    transport: messageTransport,
  }));
  useEffect(() => {
    if (
      networkSnapshot.state !== 'online' ||
      !session ||
      !reportEvidenceWorkflow ||
      !ConversationIdSchema.safeParse(conversationKey).success
    ) {
      return;
    }
    void reportEvidenceWorkflow
      .resumePendingForConversation({
        conversationId: conversationKey,
        session,
      })
      .catch(() => undefined);
  }, [conversationKey, networkSnapshot.state, reportEvidenceWorkflow, session]);
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
          assetResolver,
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
  }, [assetResolver, conversationId, loadRetrySequence, repository]);

  useEffect(() => {
    const subscription = messageTransport.subscribeNetworkState?.((state) => {
      setNetworkSnapshot({ state, transport: messageTransport });
    });
    return () => subscription?.remove();
  }, [messageTransport]);

  useEffect(() => {
    historyMessagesRef.current =
      conversationData?.conversationId === conversationKey &&
      conversationData.status === 'ready'
        ? conversationData.historyMessages
        : EMPTY_CHAT_MESSAGES;
  }, [conversationData, conversationKey]);

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

  const recoverMessageGap = useCallback(async () => {
    if (!conversationId || !repository.getMessagesAfter) return;
    if (gapRecoveryInFlightRef.current) {
      gapRecoveryPendingRef.current = true;
      return;
    }

    gapRecoveryInFlightRef.current = true;
    try {
      do {
        gapRecoveryPendingRef.current = false;
        const afterSequence = latestAuthoritativeSequence(
          historyMessagesRef.current,
        );
        const page = await repository.getMessagesAfter(
          conversationId,
          afterSequence,
        );
        if (!isMountedRef.current || page.data.items.length === 0) continue;
        const incoming = page.data.items.map((message) =>
          presentTimelineMessage(message, assetResolver),
        );
        const merged = mergeAuthoritativeMessages(
          historyMessagesRef.current,
          incoming,
        );
        historyMessagesRef.current = merged;
        setConversationData((current) =>
          current?.conversationId === conversationId &&
          current.status === 'ready'
            ? { ...current, historyMessages: merged }
            : current,
        );
      } while (gapRecoveryPendingRef.current);
    } finally {
      gapRecoveryInFlightRef.current = false;
    }
  }, [assetResolver, conversationId, repository]);

  useEffect(() => {
    if (loadState !== 'ready' || !conversationId) return;
    const realtimeSubscription = messageTransport.subscribeConversation?.(
      conversationId,
      (event) => {
        if (event.kind === 'connected' || event.kind === 'changed') {
          void recoverMessageGap();
        }
      },
    );
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') void recoverMessageGap();
      },
    );
    return () => {
      realtimeSubscription?.remove();
      appStateSubscription.remove();
    };
  }, [conversationId, loadState, messageTransport, recoverMessageGap]);

  const displayedMessages = useMemo(
    () => mergeThreadMessages(historyMessages, localMessages),
    [historyMessages, localMessages],
  );
  const latestReportTarget = useMemo(() => {
    for (let index = displayedMessages.length - 1; index >= 0; index -= 1) {
      const message = displayedMessages[index];
      if (!message) continue;
      const target = reportableMessageTarget(
        message,
        conversationKey,
        reporterPlayerId,
      );
      if (target) return target;
    }
    return null;
  }, [conversationKey, displayedMessages, reporterPlayerId]);
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
              .map((message) => presentTimelineMessage(message, assetResolver))
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
  }, [
    assetResolver,
    conversationId,
    isLoadingOlder,
    loadState,
    nextCursor,
    repository,
  ]);

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
        sequence?: number;
      },
    ) => {
      if (receipt.clientMessageId !== message.id) {
        throw new Error('Transport receipt does not match the client message.');
      }
      const commonPatch = {
        canonicalId: receipt.canonicalMessageId,
        clientMessageId: receipt.clientMessageId,
        createdAt: receipt.acceptedAt ?? message.createdAt,
        deliveryStatus: 'sent' as const,
        sequence: receipt.sequence,
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
  const advanceReadRef = useRef(messageTransport.advanceRead);

  useEffect(() => {
    unreadMessageIndexRef.current = unreadMessageIndex;
    markConversationReadRef.current = markConversationRead;
    advanceReadRef.current = messageTransport.advanceRead;
  }, [markConversationRead, messageTransport.advanceRead, unreadMessageIndex]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatTimelineItem>[] }) => {
      const firstUnreadIndex = unreadMessageIndexRef.current;
      const activeConversation = currentConversationRef.current;
      if (
        !activeConversation ||
        firstUnreadIndex < 0 ||
        AppState.currentState !== 'active'
      ) {
        return;
      }

      const visibleReadSequence = viewableItems.reduce((latest, token) => {
        if (
          !token.isViewable ||
          token.item.kind !== 'message' ||
          token.item.messageIndex < firstUnreadIndex
        ) {
          return latest;
        }
        return Math.max(latest, authoritativeSequence(token.item.message));
      }, 0);
      if (visibleReadSequence <= lastReadSequenceRequestedRef.current) return;

      const previousRequested = lastReadSequenceRequestedRef.current;
      lastReadSequenceRequestedRef.current = visibleReadSequence;
      const advanceRead = advanceReadRef.current;
      if (!advanceRead) {
        markConversationReadRef.current(activeConversation);
        return;
      }

      void advanceRead({
        conversationId: activeConversation,
        lastReadSequence: visibleReadSequence,
      })
        .then(() => {
          markConversationReadRef.current(activeConversation);
        })
        .catch(() => {
          lastReadSequenceRequestedRef.current = previousRequested;
        });
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
    <LiqiScreen
      contentContainerStyle={styles.screenContent}
      scroll={false}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <ChatHeader
        onOpenOptions={() => {
          selectionImpact();
          setOptionsVisible(true);
        }}
        thread={thread}
      />
      <ConversationSourceBanner source={surface.source} />
      <ChatNetworkBanner
        networkState={networkState}
        queuedMessageCount={queuedMessageCount}
      />
      <View style={styles.messageViewport} testID="chat-message-viewport">
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ImageBackground
            resizeMode="cover"
            source={messagesChatAssets.chatWallpaper}
            style={StyleSheet.absoluteFill}
            testID="chat-wallpaper-background"
          />
        </View>
        <LinearGradient
          colors={liqiComponentGradients.messages.wallpaperScrim}
          locations={[0, 0.52, 1]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
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
            const reportTarget =
              reportEvidenceWorkflow && reporterPlayerId
                ? reportableMessageTarget(
                    message,
                    conversationKey,
                    reporterPlayerId,
                  )
                : null;
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
                {reportTarget ? (
                  <Pressable
                    accessibilityLabel="Báo cáo tin nhắn"
                    accessibilityRole="button"
                    onPress={() => {
                      selectionImpact();
                      setMessageReportTarget(reportTarget);
                    }}
                    style={({ pressed }) => [
                      styles.messageReportAction,
                      pressed && styles.pressed,
                    ]}
                    testID={`report-message-${message.id}`}
                  >
                    <Ionicons
                      color={liqiComponentColors.messages.chat.messageReport}
                      name="flag-outline"
                      size={12}
                    />
                    <Text style={styles.messageReportActionText}>Báo cáo</Text>
                  </Pressable>
                ) : null}
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
            <Ionicons
              color={liqiColors.text.onAccent}
              name="arrow-down"
              size={14}
            />
            <Text style={styles.newMessagePillText}>
              {newMessageCount} tin nhắn mới
            </Text>
          </Pressable>
        ) : null}
        <LinearGradient
          colors={liqiComponentGradients.messages.chat.viewportTopScrim}
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
      <ConversationOptionsModal
        canMute={Boolean(
          surface.capabilities.canMute && services.conversationLifecycle,
        )}
        canReport={Boolean(latestReportTarget)}
        isMuted={surface.viewerState.isMuted}
        muting={muteConversationMutation.isPending}
        onClose={() => setOptionsVisible(false)}
        onReport={() => {
          setOptionsVisible(false);
          if (latestReportTarget) setMessageReportTarget(latestReportTarget);
        }}
        onToggleMute={() => {
          muteConversationMutation.mutate(!surface.viewerState.isMuted);
        }}
        onViewProfile={() => {
          const peer = surface.participants.preview[0];
          if (!peer) return;
          setOptionsVisible(false);
          router.push(appRoutes.profile.playerDetail(peer.id));
        }}
        onViewSource={() => {
          setOptionsVisible(false);
          if (surface.source?.type === 'play_session') {
            router.push(appRoutes.sessions.detail(surface.source.id));
          } else if (surface.source?.type === 'direct_match') {
            router.push(appRoutes.discover.matchDetail(surface.source.id));
          }
        }}
        peer={surface.participants.preview[0]}
        source={surface.source}
        visible={optionsVisible}
      />
      <ChatMessageReportModal
        onClose={() => {
          if (!reportSubmissionLockedRef.current) setMessageReportTarget(null);
        }}
        onSubmit={(category) => {
          if (reportSubmissionLockedRef.current) return;
          reportSubmissionLockedRef.current = true;
          reportMessageMutation.mutate(category);
        }}
        pending={reportMessageMutation.isPending}
        visible={Boolean(messageReportTarget)}
      />
    </LiqiScreen>
  );
}
