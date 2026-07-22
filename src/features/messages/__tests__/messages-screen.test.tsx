import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { InMemorySocialRelationshipRepository } from '@/entities/social-relationship';
import { SocialRelationshipSnapshotV2Schema } from '@/shared/contracts/core-v2';

import {
  messagesContractVersion,
  type MessageConversationSummary,
  type MessagesResponse,
} from '@/features/messages/contracts/messages-contracts';
import {
  CHAT_DRAFT_INDEX_STORAGE_KEY,
  chatDraftStorageKey,
  resetChatDraftPersistenceForTests,
} from '@/features/messages/model/chat-draft-store';
import {
  enqueueRuntimeOutgoingMedia,
  enqueueRuntimeOutgoingText,
  resetChatRuntimeStore,
  setRuntimeChatDraft,
  useChatRuntimeStore,
} from '@/features/messages/model/chat-runtime-store';
import {
  MessagesScreen,
  type MessagesScreenProps,
} from '@/features/messages/screens/MessagesScreen';
import {
  createLocalChatRepository,
  type ChatRepository,
} from '@/features/messages/services/chat-repository';
import {
  renderWithProviders,
  testAuthSession,
  testPlayerId,
} from '@/test/render-with-providers';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

const inboxReferenceDate = new Date();
inboxReferenceDate.setHours(23, 59, 0, 0);

function inboxDateAt(hour: number, minute: number) {
  const date = new Date(inboxReferenceDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const fixedInboxClock = {
  now: () => new Date(inboxReferenceDate),
};

const composeTargetPlayerId = '20000000-0000-4000-8000-000000000002';
const composeConversationId = '50000000-0000-4000-8000-000000000002';

function acceptedComposeRelationship() {
  return SocialRelationshipSnapshotV2Schema.parse({
    block: { targetBlocksViewer: false, viewerBlocksTarget: false },
    capabilities: {
      blocked: false,
      canAcceptFriendship: false,
      canBlock: true,
      canCancelFriendship: false,
      canDeclineFriendship: false,
      canDiscover: true,
      canInviteToSession: true,
      canMessage: true,
      canMute: true,
      canRemoveFriendship: true,
      canReport: true,
      canRequestFriendship: false,
      canUnblock: false,
      canUnmute: false,
      canViewConversation: true,
      canViewPresence: true,
      canViewProfile: true,
      friendshipLabel: 'friend',
      muted: false,
    },
    contractVersion: 2,
    friendship: {
      acceptedAt: '2026-07-14T10:00:00.000Z',
      label: 'friend',
      requestId: '42000000-0000-4000-8000-000000000002',
      requestState: 'accepted',
      requestVersion: 2,
      state: 'accepted',
    },
    mute: { viewerMutedTarget: false },
    relationshipId: '41000000-0000-4000-8000-000000000002',
    targetPlayerId: composeTargetPlayerId,
    targetPrivacy: {
      contractVersion: 2,
      friendshipRequests: 'everyone',
      playerId: composeTargetPlayerId,
      presenceVisibility: 'friends',
      profileVisibility: 'friends',
      sessionInvites: 'friends',
      trustVisibility: 'friends',
      updatedAt: '2026-07-14T09:00:00.000Z',
      version: 1,
    },
    updatedAt: '2026-07-14T10:00:00.000Z',
    version: 2,
    viewerPlayerId: testPlayerId,
  });
}

function response<T>(data: T): MessagesResponse<T> {
  return {
    contractVersion: messagesContractVersion,
    data,
    meta: {
      generatedAt: inboxReferenceDate.toISOString(),
      requestId: 'messages-test-request',
    },
  };
}

function conversationSummary(
  overrides: Partial<MessageConversationSummary> = {},
): MessageConversationSummary {
  return {
    capabilities: {
      canCall: true,
      canMessage: true,
      canMute: true,
      canViewDetails: true,
      composerActions: [],
    },
    id: 'unread-thread',
    kind: 'direct',
    latestActivity: {
      createdAt: inboxDateAt(23, 0).toISOString(),
      direction: 'incoming',
      id: 'unread-message',
      kind: 'text',
      preview: 'Tin chưa đọc',
    },
    participants: {
      preview: [
        {
          displayName: 'Người chưa đọc',
          id: 'participant:unread-thread',
          role: 'member',
        },
      ],
      totalCount: 2,
    },
    presence: { label: 'Ngoại tuyến', state: 'offline' },
    relationship: 'friend',
    title: 'Người chưa đọc',
    viewerState: {
      firstUnreadMessageId: 'unread-message',
      isArchived: false,
      isMuted: false,
      isPinned: false,
      unreadCount: 1,
    },
    ...overrides,
  };
}

function repositoryForItems(
  items: readonly MessageConversationSummary[],
): ChatRepository {
  const base = createLocalChatRepository();
  return {
    ...base,
    async listConversations() {
      return response({
        items: [...items],
        pageInfo: { hasNextPage: false, nextCursor: null },
        totalCount: items.length,
        unreadConversationCount: items.filter(
          (item) => item.viewerState.unreadCount > 0,
        ).length,
      });
    },
  };
}

async function renderMessagesScreen(
  props: Omit<MessagesScreenProps, 'clock'> = {},
) {
  const repository = props.repository ?? createLocalChatRepository();
  const screen = await renderWithProviders(
    <MessagesScreen
      clock={fixedInboxClock}
      {...props}
      repository={repository}
    />,
  );
  await waitFor(() =>
    expect(screen.queryByText('Đang tải cuộc trò chuyện')).toBeNull(),
  );
  return screen;
}

describe('MessagesScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockRouterPush.mockClear();
    resetChatDraftPersistenceForTests();
    resetChatRuntimeStore();
    useChatRuntimeStore.getState().hydrateDraftIndex({});
  });

  it('renders the action-oriented inbox from conversation summaries', async () => {
    const screen = await renderMessagesScreen();

    await waitFor(() => expect(screen.getByText('Cần bạn xử lý')).toBeTruthy());
    expect(screen.getByText('Tin nhắn')).toBeTruthy();
    expect(screen.getByTestId('messages-identity-header')).toBeTruthy();
    expect(
      screen.getByText('Kết nối với những người bạn hợp vibe'),
    ).toBeTruthy();
    expect(screen.queryByText('KẾT NỐI')).toBeNull();
    expect(
      screen.queryByPlaceholderText('Tìm người hoặc trò chuyện...'),
    ).toBeNull();
    await fireEvent.press(screen.getByLabelText('Tìm cuộc trò chuyện'));
    expect(
      screen.getByPlaceholderText('Tìm người hoặc trò chuyện...'),
    ).toBeTruthy();
    expect(screen.getByText('Tất cả')).toBeTruthy();
    expect(screen.getByText('Chưa đọc')).toBeTruthy();
    expect(screen.getByText('Cá nhân')).toBeTruthy();
    expect(screen.getByText('Nhóm')).toBeTruthy();
    expect(screen.queryByText('Tri kỉ')).toBeNull();
    expect(screen.getByTestId('messages-unread-filter-indicator')).toBeTruthy();
    expect(screen.getAllByText('Minh Anh').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Mở chat với Minh Anh')).toBeTruthy();
    expect(
      screen.getByTestId('messages-conversation-card-minh-anh'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('messages-conversation-artwork-minh-anh'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Tin nhắn cuối: Bạn: 👊🏻')).toBeTruthy();
    expect(screen.getByText('20:33')).toBeTruthy();
    expect(screen.getAllByLabelText('Tin nhắn đã đọc').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByText('Tối nay rảnh không? Mình leo rank nha ✨'),
    ).toBeNull();
    expect(screen.getAllByText('Khoa Jungle').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team Sao Băng').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Tạo cuộc trò chuyện')).toBeTruthy();
    expect(screen.queryByLabelText('Tuỳ chọn tin nhắn')).toBeNull();
  });

  it('opens the exact provisioned direct conversation from the friend picker', async () => {
    const relationshipRepository = new InMemorySocialRelationshipRepository({
      relationships: [acceptedComposeRelationship()],
    });
    const repository = repositoryForItems([
      conversationSummary({
        id: composeConversationId,
        kind: 'direct',
        participants: {
          preview: [
            {
              displayName: 'Người chơi 1',
              id: composeTargetPlayerId,
              role: 'member',
            },
          ],
          totalCount: 2,
        },
        relationship: 'friend',
        source: {
          id: '41000000-0000-4000-8000-000000000002',
          type: 'friendship',
        },
        title: 'Người chơi 1',
      }),
    ]);
    const screen = await renderWithProviders(
      <MessagesScreen clock={fixedInboxClock} repository={repository} />,
      { serviceOverrides: { relationshipRepository } },
    );

    await fireEvent.press(screen.getByLabelText('Tạo cuộc trò chuyện'));
    expect(
      (await screen.findAllByText('Bắt đầu trò chuyện')).length,
    ).toBeGreaterThan(1);
    await fireEvent.press(await screen.findByLabelText('Chọn Người chơi 1'));
    await fireEvent.press(screen.getByText('Xác nhận'));

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(
        appRoutes.messages.detail(composeConversationId),
      ),
    );
  });

  it('queries search through the repository contract', async () => {
    const base = createLocalChatRepository();
    const listConversations = jest.fn(base.listConversations);
    const repository = { ...base, listConversations };
    const screen = await renderMessagesScreen({ repository });
    await fireEvent.press(screen.getByLabelText('Tìm cuộc trò chuyện'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('Tìm người hoặc trò chuyện...'),
      'Khoa',
    );

    await waitFor(() =>
      expect(listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'all', query: 'Khoa' }),
        expect.objectContaining({ viewerId: testAuthSession.user.id }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Mở chat với Khoa Jungle')).toBeTruthy();
      expect(screen.queryByLabelText('Mở chat với Minh Anh')).toBeNull();
    });
  });

  it('filters conversation shape through the repository contract', async () => {
    const base = createLocalChatRepository();
    const listConversations = jest.fn(base.listConversations);
    const repository = { ...base, listConversations };
    const screen = await renderMessagesScreen({ repository });

    await fireEvent.press(screen.getByLabelText('Lọc Nhóm'));

    await waitFor(() =>
      expect(listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'group', query: '' }),
        expect.objectContaining({ viewerId: testAuthSession.user.id }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Mở chat với Team Sao Băng')).toBeTruthy();
      expect(screen.getByLabelText('Mở chat với Aya Only')).toBeTruthy();
      expect(screen.queryByLabelText('Mở chat với Minh Anh')).toBeNull();
    });

    await fireEvent.press(screen.getByLabelText('Lọc Cá nhân'));

    await waitFor(() =>
      expect(listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'direct', query: '' }),
        expect.objectContaining({ viewerId: testAuthSession.user.id }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Mở chat với Minh Anh')).toBeTruthy();
      expect(screen.getByLabelText('Mở chat với Khoa Jungle')).toBeTruthy();
      expect(screen.queryByLabelText('Mở chat với Team Sao Băng')).toBeNull();
      expect(screen.queryByLabelText('Mở chat với Aya Only')).toBeNull();
    });
  });

  it('reacts to optimistic text and media without refetching', async () => {
    enqueueRuntimeOutgoingText({
      createdAt: inboxDateAt(21, 45).toISOString(),
      conversationId: 'minh-anh',
      text: 'Tin mới đồng bộ ra inbox',
    });
    const first = await renderMessagesScreen();

    await waitFor(() =>
      expect(
        first.getByLabelText('Tin nhắn cuối: Bạn: Tin mới đồng bộ ra inbox'),
      ).toBeTruthy(),
    );
    expect(first.getByText('21:45')).toBeTruthy();
    expect(first.getByLabelText('Tin nhắn đang gửi')).toBeTruthy();

    await act(async () => {
      enqueueRuntimeOutgoingMedia({
        attachment: {
          fileName: 'rank.jpg',
          mediaType: 'image',
          uri: 'file:///rank.jpg',
        },
        conversationId: 'khoa-jungle',
        createdAt: inboxDateAt(22, 10).toISOString(),
      });
    });

    await waitFor(() =>
      expect(
        first.getByLabelText('Tin nhắn cuối: Bạn: Đã gửi một ảnh'),
      ).toBeTruthy(),
    );
    expect(first.getByText('22:10')).toBeTruthy();
    expect(first.getAllByLabelText('Tin nhắn đang gửi').length).toBeGreaterThan(
      0,
    );
  });

  it('prioritizes a local draft over server activity', async () => {
    setRuntimeChatDraft(
      'minh-anh',
      `  Draft leo rank
8 giờ tối  `,
    );
    const screen = await renderMessagesScreen();

    await waitFor(() => expect(screen.getByText('Cần bạn xử lý')).toBeTruthy());
    expect(
      screen.getByLabelText(
        'Tin nhắn cuối: Bản nháp: Draft leo rank 8 giờ tối',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Có bản nháp')).toBeTruthy();
  });

  it('removes unread representation after the local read mutation', async () => {
    const repository = repositoryForItems([conversationSummary()]);
    const screen = await renderMessagesScreen({ repository });

    await waitFor(() =>
      expect(screen.getByLabelText('1 tin nhắn chưa đọc')).toBeTruthy(),
    );
    await act(async () => {
      useChatRuntimeStore.getState().markConversationRead('unread-thread');
    });
    await waitFor(() =>
      expect(screen.queryByLabelText('1 tin nhắn chưa đọc')).toBeNull(),
    );
  });

  it('renders a backend-shaped conversation with no presentation fixture', async () => {
    const repository = repositoryForItems([
      conversationSummary({
        id: 'new-repository-thread',
        latestActivity: {
          createdAt: inboxDateAt(23, 0).toISOString(),
          direction: 'incoming',
          id: 'new-message',
          kind: 'text',
          preview: 'Conversation mới từ repository',
        },
        title: 'Người chơi mới',
        viewerState: {
          isArchived: false,
          isMuted: false,
          isPinned: false,
          unreadCount: 0,
        },
      }),
    ]);
    const screen = await renderMessagesScreen({ repository });

    await waitFor(() =>
      expect(screen.getByLabelText('Mở chat với Người chơi mới')).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Tin nhắn cuối: Conversation mới từ repository'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(
        'messages-conversation-artwork-new-repository-thread',
      ),
    ).toBeNull();
  });

  it('shows queued delivery instead of a false sent receipt', async () => {
    const message = enqueueRuntimeOutgoingText({
      createdAt: inboxDateAt(22, 20).toISOString(),
      conversationId: 'minh-anh',
      text: 'Đợi kết nối lại',
    });
    useChatRuntimeStore
      .getState()
      .patchOutgoingMessage('minh-anh', message.id, {
        deliveryStatus: 'queued',
      });
    const screen = await renderMessagesScreen();

    await waitFor(() =>
      expect(
        screen.getByLabelText('Tin nhắn cuối: Bạn: Đợi kết nối lại'),
      ).toBeTruthy(),
    );
    expect(screen.getByLabelText('Tin nhắn đang chờ mạng')).toBeTruthy();
  });

  it('offers retry for a retryable inbox failure', async () => {
    const base = createLocalChatRepository();
    const repository: ChatRepository = {
      ...base,
      async listConversations() {
        throw Object.assign(new Error('Messages network failure'), {
          code: 'network_error',
          retryable: true,
        });
      },
    };
    const screen = await renderMessagesScreen({ repository });

    expect(screen.getByText('Không thể tải hộp thư')).toBeTruthy();
    expect(screen.getByLabelText('Thử lại')).toBeTruthy();
  });

  it('does not offer retry for a non-retryable inbox failure', async () => {
    const base = createLocalChatRepository();
    const repository: ChatRepository = {
      ...base,
      async listConversations() {
        throw Object.assign(new Error('Invalid messages request'), {
          code: 'validation_failed',
          retryable: false,
        });
      },
    };
    const screen = await renderMessagesScreen({ repository });

    expect(screen.getByText('Không thể tải hộp thư')).toBeTruthy();
    expect(screen.queryByLabelText('Thử lại')).toBeNull();
  });

  it('keeps the latest inbox visible when refresh fails', async () => {
    const page = response({
      items: [conversationSummary()],
      pageInfo: { hasNextPage: false, nextCursor: null },
      totalCount: 1,
      unreadConversationCount: 1,
    });
    const listConversations = jest
      .fn<ChatRepository['listConversations']>()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(
        Object.assign(new Error('Messages refresh failure'), {
          code: 'network_error',
          retryable: true,
        }),
      );
    const repository: ChatRepository = {
      ...createLocalChatRepository(),
      listConversations,
    };
    const screen = await renderMessagesScreen({ repository });
    expect(await screen.findByText('Người chưa đọc')).toBeTruthy();

    await act(async () => {
      await screen.queryClient.refetchQueries({ queryKey: ['messages'] });
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText('Hộp thư đang hiển thị dữ liệu cũ'),
      ).toBeTruthy();
    });
    expect(screen.getByText('Người chưa đọc')).toBeTruthy();
  });

  it('hydrates one persisted draft index without reading every full draft', async () => {
    resetChatRuntimeStore();
    const getItem = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockImplementation(async (key) =>
        key === CHAT_DRAFT_INDEX_STORAGE_KEY
          ? JSON.stringify({
              'khoa-jungle': {
                hasAttachments: false,
                preview: 'Draft build hồi chiêu',
                updatedAt: inboxDateAt(22, 30).getTime(),
              },
            })
          : null,
      );
    const screen = await renderMessagesScreen();

    await waitFor(() =>
      expect(
        screen.getByLabelText('Tin nhắn cuối: Bản nháp: Draft build hồi chiêu'),
      ).toBeTruthy(),
    );
    expect(getItem).toHaveBeenCalledWith(CHAT_DRAFT_INDEX_STORAGE_KEY);
    expect(getItem).not.toHaveBeenCalledWith(
      chatDraftStorageKey('khoa-jungle'),
    );
  });
});
