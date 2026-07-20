import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  createRuntimeUuid,
  usePlaySessionServices,
} from '@/entities/play-session';
import { resolveVerifiedConversationActorV2 } from '@/entities/conversation-v2';
import { useAuth } from '@/shared/auth/auth-context';
import {
  ConversationIdSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  RequestIdSchema,
} from '@/shared/contracts/core-v1';
import { LiqiButton, LiqiCard } from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors, liqiTypography } from '@/shared/theme/liqi-design-system';

export const sessionConversationQueryKeys = {
  detail: (playerId: string, conversationId: string) =>
    [
      'core-v2',
      'session-conversation',
      'player',
      playerId,
      conversationId,
    ] as const,
  timeline: (playerId: string, conversationId: string) =>
    [
      'core-v2',
      'session-conversation',
      'player',
      playerId,
      conversationId,
      'timeline',
    ] as const,
};

export function SessionConversationScreen() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const parsed = ConversationIdSchema.safeParse(params.conversationId);
  const conversationId = parsed.success ? parsed.data : null;
  const { session } = useAuth();
  const { conversationMessageTransport, conversationRepository } =
    usePlaySessionServices();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const actor = session ? resolveVerifiedConversationActorV2(session) : null;
  const actorPlayerId = actor?.playerId ?? 'anonymous';
  const conversation = useQuery({
    enabled: Boolean(actor && conversationId && conversationRepository),
    queryFn: async () => {
      if (!actor || !conversationId || !conversationRepository) return null;
      return conversationRepository.getConversation(actor, conversationId);
    },
    queryKey: sessionConversationQueryKeys.detail(
      actorPlayerId,
      conversationId ?? 'missing',
    ),
  });
  const timeline = useQuery({
    enabled: Boolean(actor && conversationId && conversationRepository),
    queryFn: async () => {
      if (!actor || !conversationId || !conversationRepository) return [];
      return conversationRepository.getTimeline(actor, conversationId);
    },
    queryKey: sessionConversationQueryKeys.timeline(
      actorPlayerId,
      conversationId ?? 'missing',
    ),
  });
  const send = useMutation({
    mutationFn: async (messageText: string) => {
      if (
        !actor ||
        !conversationId ||
        !conversationMessageTransport ||
        !conversation.data
      ) {
        throw new Error('Conversation V2 authority is unavailable.');
      }
      const idempotencyKey = IdempotencyKeySchema.parse(
        `message.${createRuntimeUuid()}`,
      );
      return conversationMessageTransport.sendText(actor, {
        clientMessageId: idempotencyKey,
        conversationId,
        metadata: {
          audit: {
            clientCreatedAt: new Date().toISOString(),
            clientPlatform: 'android',
            clientVersion: 'core-v2',
            requestId: RequestIdSchema.parse(createRuntimeUuid()),
          },
          causationId: null,
          correlationId: CorrelationIdSchema.parse(createRuntimeUuid()),
          expectedAggregateVersion: conversation.data.version,
          idempotencyKey,
        },
        text: messageText,
      });
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: sessionConversationQueryKeys.detail(
            actorPlayerId,
            conversationId ?? 'missing',
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: sessionConversationQueryKeys.timeline(
            actorPlayerId,
            conversationId ?? 'missing',
          ),
        }),
      ]);
    },
    onSuccess: async () => {
      setText('');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: sessionConversationQueryKeys.detail(
            actorPlayerId,
            conversationId ?? 'missing',
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: sessionConversationQueryKeys.timeline(
            actorPlayerId,
            conversationId ?? 'missing',
          ),
        }),
      ]);
    },
    retry: false,
  });

  if (!conversationId) {
    return (
      <LiqiScreen title="Conversation không hợp lệ">
        <Text style={styles.error}>ConversationId không đúng contract.</Text>
      </LiqiScreen>
    );
  }
  if (!conversationRepository || !conversationMessageTransport) {
    return (
      <LiqiScreen title="Communication đang đồng bộ">
        <Text style={styles.meta}>
          Trò chuyện của buổi chơi chưa sẵn sàng. Hãy quay lại danh sách tin
          nhắn và thử lại.
        </Text>
      </LiqiScreen>
    );
  }

  return (
    <LiqiScreen
      subtitle="Quyền gửi tin nhắn được cập nhật theo thành viên của buổi chơi."
      title={conversation.data?.title ?? 'Session conversation'}
      withBottomNavPadding={false}
    >
      {timeline.data?.map((message) => (
        <LiqiCard key={message.messageId} style={styles.message} variant="cyan">
          <Text style={styles.sender}>
            {message.senderPlayerId ? 'Thành viên' : 'Hệ thống'}
          </Text>
          <Text style={styles.body}>
            {message.content.kind === 'text'
              ? message.content.text
              : message.content.kind === 'media'
                ? (message.content.caption ?? 'Media')
                : message.content.sourceEventType}
          </Text>
        </LiqiCard>
      ))}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Tin nhắn Session"
          multiline
          onChangeText={setText}
          placeholder="Nhắn cho cả party…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          value={text}
        />
        <LiqiButton
          disabled={!text.trim() || send.isPending}
          onPress={() => send.mutate(text.trim())}
          variant="rank"
        >
          Gửi
        </LiqiButton>
      </View>
      {send.error ? (
        <Text style={styles.error}>{send.error.message}</Text>
      ) : null}
    </LiqiScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    ...liqiTypography.body,
    color: liqiColors.text.primary,
    marginTop: 5,
  },
  composer: { gap: 10, marginTop: 18 },
  error: { color: '#FF9CB5', marginTop: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    color: liqiColors.text.primary,
    minHeight: 72,
    padding: 14,
    textAlignVertical: 'top',
  },
  message: { marginTop: 10 },
  meta: { ...liqiTypography.body },
  sender: { ...liqiTypography.sectionLabel },
});
