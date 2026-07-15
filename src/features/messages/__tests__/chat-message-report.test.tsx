import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  MessageConversationResponseSchema,
  MessageTimelineResponseSchema,
} from '@/features/messages/contracts/messages-contracts';
import { resetChatDraftPersistenceForTests } from '@/features/messages/model/chat-draft-store';
import { resetChatRuntimeStore } from '@/features/messages/model/chat-runtime-store';
import { ChatConversationScreen } from '@/features/messages/screens/ChatConversationScreen';
import { createChatScenarioController } from '@/features/messages/services/chat-message-transport';
import {
  MessageReportEvidenceJournal,
  MessageReportEvidenceV2Schema,
  MessageReportEvidenceWorkflow,
} from '@/features/messages/services/message-report-evidence';
import {
  createLocalChatRepository,
  type ChatRepository,
} from '@/features/messages/services/chat-repository';
import { ReportReceiptV2Schema } from '@/shared/contracts/core-v2';
import {
  createTestAuthSession,
  renderWithProviders,
  testPlayerId,
} from '@/test/render-with-providers';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  randomUUID: jest.fn(() => '43000000-0000-4000-8000-000000001500'),
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

const conversationId = '60000000-0000-4000-8000-000000001500';
const messageId = '61000000-0000-4000-8000-000000001500';
const senderPlayerId = '20000000-0000-4000-8000-000000001500';
const reportId = '44000000-0000-4000-8000-000000001500';
const generatedAt = '2026-07-14T15:00:00.000Z';

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetChatDraftPersistenceForTests();
  resetChatRuntimeStore();
  await AsyncStorage.clear();
});

describe('Chat message report entry', () => {
  it('submits canonical incoming message evidence through report_message_v2', async () => {
    const reportMessage = jest.fn(async (_session: unknown, command: any) =>
      ReportReceiptV2Schema.parse({
        correlationId: command.correlationId,
        eventIds: ['43000000-0000-4000-8000-000000001501'],
        repeated: false,
        reportId,
        status: 'submitted',
        version: 1,
      }),
    );
    const relationshipRuntime = createRelationshipRuntime({ reportMessage });
    const captureReportEvidence = jest.fn(async () => canonicalEvidence());
    const repository = canonicalChatRepository();
    const scenario = createChatScenarioController();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const screen = await renderWithProviders(
      <ChatConversationScreen
        conversationId={conversationId}
        messageTransport={scenario.transport}
        repository={repository}
      />,
      {
        serviceOverrides: {
          messageReportEvidenceProvider: { captureReportEvidence },
          relationshipRepository: relationshipRuntime,
        },
      },
    );

    expect(
      await screen.findByText('Canonical reportable message'),
    ).toBeTruthy();
    expect(screen.getAllByLabelText('Báo cáo tin nhắn')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId(`report-message-${messageId}`));
    const harassmentOption = screen.getByLabelText(
      'Báo cáo tin nhắn: Quấy rối',
    );
    await fireEvent.press(harassmentOption);
    await fireEvent.press(harassmentOption);

    await waitFor(() => expect(reportMessage).toHaveBeenCalledTimes(1));
    expect(reportMessage.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        category: 'harassment',
        conversationId,
        expectedReportVersion: 0,
        messageId,
        targetPlayerId: senderPlayerId,
      }),
    );
    expect(captureReportEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ reportId }),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Đã gửi báo cáo',
      'Tin nhắn và bằng chứng bất biến đã được ghi nhận để đội an toàn xem xét.',
    );
  });

  it('keeps a successful report receipt when evidence verification times out', async () => {
    const reportMessage = jest.fn(async (_session: unknown, command: any) =>
      ReportReceiptV2Schema.parse({
        correlationId: command.correlationId,
        eventIds: ['43000000-0000-4000-8000-000000001501'],
        repeated: false,
        reportId,
        status: 'submitted',
        version: 1,
      }),
    );
    const captureReportEvidence = jest.fn(async () => {
      throw new TypeError('network timeout');
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const scenario = createChatScenarioController();
    const screen = await renderWithProviders(
      <ChatConversationScreen
        conversationId={conversationId}
        messageTransport={scenario.transport}
        repository={canonicalChatRepository()}
      />,
      {
        serviceOverrides: {
          messageReportEvidenceProvider: { captureReportEvidence },
          relationshipRepository: createRelationshipRuntime({ reportMessage }),
        },
      },
    );

    expect(
      await screen.findByText('Canonical reportable message'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`report-message-${messageId}`));
    await fireEvent.press(screen.getByLabelText('Báo cáo tin nhắn: Đe doạ'));

    await waitFor(() => expect(reportMessage).toHaveBeenCalledTimes(1));
    expect(captureReportEvidence).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Đã gửi báo cáo',
      'Báo cáo đã được ghi nhận. Bằng chứng đang chờ đồng bộ và sẽ tự thử lại khi kết nối ổn định.',
    );
  });

  it('retries evidence only when the conversation network returns online', async () => {
    const reportMessage = jest.fn(async () =>
      ReportReceiptV2Schema.parse({
        correlationId: '43000000-0000-4000-8000-000000001500',
        eventIds: ['43000000-0000-4000-8000-000000001501'],
        repeated: false,
        reportId,
        status: 'submitted',
        version: 1,
      }),
    );
    let captureAttempts = 0;
    const captureReportEvidence = jest.fn(async () => {
      captureAttempts += 1;
      if (captureAttempts === 1) throw new TypeError('network timeout');
      return canonicalEvidence();
    });
    const workflow = new MessageReportEvidenceWorkflow(
      { reportMessage },
      { captureReportEvidence },
      new MessageReportEvidenceJournal({ storage: createStatefulStorage() }),
    );
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const scenario = createChatScenarioController({ network: 'offline' });
    const screen = await renderWithProviders(
      <ChatConversationScreen
        conversationId={conversationId}
        messageReportEvidenceWorkflow={workflow}
        messageTransport={scenario.transport}
        repository={canonicalChatRepository()}
      />,
      {
        serviceOverrides: {
          relationshipRepository: createRelationshipRuntime({ reportMessage }),
        },
      },
    );

    expect(
      await screen.findByText('Canonical reportable message'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`report-message-${messageId}`));
    await fireEvent.press(
      screen.getByLabelText('Báo cáo tin nhắn: Spam hoặc lừa đảo'),
    );
    await waitFor(() => expect(captureReportEvidence).toHaveBeenCalledTimes(1));
    await act(() => {
      scenario.setNetworkState('online');
    });
    await waitFor(() => expect(captureReportEvidence).toHaveBeenCalledTimes(2));
    expect(reportMessage).toHaveBeenCalledTimes(1);
  });

  it('fails closed for a suspended reporter even when canonical messages are visible', async () => {
    const scenario = createChatScenarioController();
    const screen = await renderWithProviders(
      <ChatConversationScreen
        conversationId={conversationId}
        messageTransport={scenario.transport}
        repository={canonicalChatRepository()}
      />,
      {
        serviceOverrides: {
          messageReportEvidenceProvider: {
            captureReportEvidence: jest.fn(async () => canonicalEvidence()),
          },
          relationshipRepository: createRelationshipRuntime({
            reportMessage: jest.fn(),
          }),
        },
        session: createTestAuthSession({ lifecycleState: 'suspended' }),
      },
    );

    expect(
      await screen.findByText('Canonical reportable message'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Báo cáo tin nhắn')).toBeNull();
  });

  it('does not expose report capability for noncanonical simulation messages', async () => {
    const relationshipRuntime = createRelationshipRuntime({
      reportMessage: jest.fn(),
    });
    const scenario = createChatScenarioController();
    const screen = await renderWithProviders(
      <ChatConversationScreen
        conversationId="minh-anh"
        messageTransport={scenario.transport}
        repository={createLocalChatRepository()}
      />,
      {
        serviceOverrides: { relationshipRepository: relationshipRuntime },
      },
    );

    expect(
      await screen.findByText('Tối nay rảnh không? Mình leo rank nha ✨'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Báo cáo tin nhắn')).toBeNull();
  });
});

function canonicalEvidence() {
  return MessageReportEvidenceV2Schema.parse({
    capturedAt: generatedAt,
    conversationId,
    evidenceId: '45000000-0000-4000-8000-000000001500',
    message: {
      clientMessageId: 'report-evidence-client-0001',
      content: { kind: 'text', text: 'Canonical reportable message' },
      conversationId,
      createdAt: generatedAt,
      messageId,
      senderPlayerId,
      sequence: 1,
      tombstonedAt: null,
    },
    reporterPlayerId: testPlayerId,
  });
}

function canonicalChatRepository(): ChatRepository {
  return {
    async getConversation(requestedConversationId) {
      if (requestedConversationId !== conversationId) return null;
      return MessageConversationResponseSchema.parse({
        contractVersion: 1,
        data: {
          capabilities: {
            canCall: false,
            canMessage: true,
            canMute: true,
            canViewDetails: true,
            composerActions: [],
          },
          composer: { placeholder: 'Nhắn tin…' },
          fallbackIcon: 'person-outline',
          id: conversationId,
          kind: 'direct',
          latestActivity: null,
          liveState: { typingParticipantIds: [] },
          members: [
            {
              displayName: 'Canonical Sender',
              id: senderPlayerId,
              role: 'member',
            },
          ],
          participants: {
            preview: [
              {
                displayName: 'Canonical Sender',
                id: senderPlayerId,
                role: 'member',
              },
            ],
            totalCount: 2,
          },
          presence: { label: 'Đang online', state: 'online' },
          relationship: 'match',
          subtitle: 'Hồ sơ người chơi canonical',
          title: 'Canonical Sender',
          viewerState: {
            isArchived: false,
            isMuted: false,
            isPinned: false,
            unreadCount: 1,
          },
        },
        meta: { generatedAt, requestId: 'conversation-report-test' },
      });
    },
    async getMessagePage(requestedConversationId) {
      if (requestedConversationId !== conversationId) {
        return MessageTimelineResponseSchema.parse({
          contractVersion: 1,
          data: {
            items: [],
            pageInfo: { hasNextPage: false, nextCursor: null },
          },
          meta: { generatedAt, requestId: 'timeline-empty-report-test' },
        });
      }
      return MessageTimelineResponseSchema.parse({
        contractVersion: 1,
        data: {
          items: [
            {
              createdAt: generatedAt,
              direction: 'incoming',
              id: messageId,
              kind: 'text',
              senderId: senderPlayerId,
              sequence: 1,
              text: 'Canonical reportable message',
            },
            {
              createdAt: '2026-07-14T15:01:00.000Z',
              direction: 'outgoing',
              id: '61000000-0000-4000-8000-000000001501',
              kind: 'text',
              senderId: testPlayerId,
              sequence: 2,
              text: 'Canonical outgoing message',
            },
            {
              createdAt: '2026-07-14T15:02:00.000Z',
              direction: 'incoming',
              id: '61000000-0000-4000-8000-000000001502',
              kind: 'text',
              senderId: testPlayerId,
              sequence: 3,
              text: 'Malformed self incoming message',
            },
          ],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
        meta: { generatedAt, requestId: 'timeline-report-test' },
      });
    },
    async listConversations() {
      throw new Error('Inbox is not used by the report consumer test.');
    },
  };
}

function createStatefulStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    removeItem: async (key: string) => {
      values.delete(key);
    },
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function createRelationshipRuntime(overrides: Record<string, unknown>) {
  const unused = jest.fn(async () => {
    throw new Error('Unexpected social operation in message-report test.');
  });
  return {
    acceptFriendship: unused,
    blockPlayer: unused,
    cancelFriendship: unused,
    declineFriendship: unused,
    getPrivacy: unused,
    getRelationship: unused,
    getTrustVisibility: unused,
    listBlockedPlayers: unused,
    listFriendships: unused,
    mutePlayer: unused,
    removeFriendship: unused,
    reportMessage: unused,
    reportPlayer: unused,
    requestFriendship: unused,
    unblockPlayer: unused,
    unmutePlayer: unused,
    updatePrivacy: unused,
    ...overrides,
  } as never;
}
