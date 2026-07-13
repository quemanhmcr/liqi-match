import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

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
import { renderWithProviders } from '@/test/render-with-providers';

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
  const screen = await renderWithProviders(
    <MessagesScreen clock={fixedInboxClock} {...props} />,
  );
  await waitFor(() =>
    expect(screen.queryByText('Đang tải cuộc trò chuyện')).toBeNull(),
  );
  return screen;
}

describe('MessagesScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    resetChatDraftPersistenceForTests();
    resetChatRuntimeStore();
    useChatRuntimeStore.getState().hydrateDraftIndex({});
  });

  it('renders the action-oriented inbox from conversation summaries', async () => {
    const screen = await renderMessagesScreen();

    await waitFor(() => expect(screen.getByText('Cần bạn xử lý')).toBeTruthy());
    expect(screen.getByText('Tin nhắn')).toBeTruthy();
    expect(
      screen.getByPlaceholderText('Tìm người hoặc trò chuyện...'),
    ).toBeTruthy();
    expect(screen.getByText('Tất cả')).toBeTruthy();
    expect(screen.getAllByText(/Chưa đọc/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Minh Anh').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Mở chat với Minh Anh')).toBeTruthy();
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
    expect(screen.getByLabelText('Tuỳ chọn tin nhắn')).toBeTruthy();
  });

  it('queries search through the repository contract', async () => {
    const base = createLocalChatRepository();
    const listConversations = jest.fn(base.listConversations);
    const repository = { ...base, listConversations };
    const screen = await renderMessagesScreen({ repository });
    await fireEvent.changeText(
      screen.getByPlaceholderText('Tìm người hoặc trò chuyện...'),
      'Khoa',
    );

    await waitFor(() =>
      expect(listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'all', query: 'Khoa' }),
        expect.objectContaining({ viewerId: 'preview-viewer' }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Mở chat với Khoa Jungle')).toBeTruthy();
      expect(screen.queryByLabelText('Mở chat với Minh Anh')).toBeNull();
    });
  });

  it('filters through the repository contract', async () => {
    const base = createLocalChatRepository();
    const listConversations = jest.fn(base.listConversations);
    const repository = { ...base, listConversations };
    const screen = await renderMessagesScreen({ repository });

    await fireEvent.press(screen.getByLabelText('Lọc Team'));

    await waitFor(() =>
      expect(listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'teams', query: '' }),
        expect.objectContaining({ viewerId: 'preview-viewer' }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Mở chat với Team Sao Băng')).toBeTruthy();
      expect(screen.queryByLabelText('Mở chat với Minh Anh')).toBeNull();
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
