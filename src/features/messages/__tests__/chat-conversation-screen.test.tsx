import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Keyboard, Platform, ScrollView, StyleSheet } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import {
  CHAT_DRAFT_INDEX_STORAGE_KEY,
  chatDraftStorageKey,
  resetChatDraftPersistenceForTests,
} from '@/features/messages/model/chat-draft-store';
import {
  resetChatRuntimeStore,
  useChatRuntimeStore,
} from '@/features/messages/model/chat-runtime-store';
import { ChatConversationScreen } from '@/features/messages/screens/ChatConversationScreen';
import {
  createChatScenarioController,
  type ChatMessageTransport,
  type SendChatMediaReceipt,
  type SendChatTextReceipt,
} from '@/features/messages/services/chat-message-transport';
import { createLocalChatRepository } from '@/features/messages/services/chat-repository';
import { renderWithProviders } from '@/test/render-with-providers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function mockAnimationFrameQueue() {
  let nextId = 1;
  const callbacks = new Map<
    number,
    Parameters<typeof requestAnimationFrame>[0]
  >();

  jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    if (typeof id === 'number') callbacks.delete(id);
  });

  return {
    get pendingCount() {
      return callbacks.size;
    },
    async runNext() {
      const next = callbacks.entries().next().value as
        [number, Parameters<typeof requestAnimationFrame>[0]] | undefined;
      if (!next) throw new Error('No animation frame is pending.');
      const [id, callback] = next;
      callbacks.delete(id);
      await act(async () => {
        callback(0);
      });
    },
  };
}

const closedKeyboardState = KeyboardController.state();
const writableConversationIds = [
  'aya-only',
  'cozy-helen',
  'cyber-violet',
  'huy-hoang',
  'khoa-jungle',
  'lorian',
  'minh-anh',
  'quoc-bao',
  'team-sao-bang',
] as const;

function renderChatWithProviders(
  ui: Parameters<typeof renderWithProviders>[0],
  options: Parameters<typeof renderWithProviders>[1] = {},
) {
  const scenario = createChatScenarioController();
  return renderWithProviders(ui, {
    ...options,
    serviceOverrides: {
      messageRepository: createLocalChatRepository(),
      messageTransport: scenario.transport,
      ...options?.serviceOverrides,
    },
  });
}

function mockImageSelection() {
  return jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
    assets: [
      {
        assetId: 'asset-1',
        base64: null,
        duration: null,
        exif: null,
        fileName: 'rank.jpg',
        fileSize: 1200,
        height: 900,
        mimeType: 'image/jpeg',
        pairedVideoAsset: null,
        type: 'image',
        uri: 'file:///rank.jpg',
        width: 1200,
      },
    ],
    canceled: false,
  });
}

describe('ChatConversationScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest
      .mocked(KeyboardController.state)
      .mockReturnValue({ ...closedKeyboardState, height: 0 });
    resetChatDraftPersistenceForTests();
    resetChatRuntimeStore();
  });
  it('renders the relationship-priority chat experience', async () => {
    const {
      getByLabelText,
      getByPlaceholderText,
      getByText,
      queryByLabelText,
    } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="minh-anh" />,
    );

    expect(getByText('Minh Anh')).toBeTruthy();
    expect(getByText('Tri kỉ')).toBeTruthy();
    expect(getByText('Đang online')).toBeTruthy();
    expect(getByText('Tối nay rảnh không? Mình leo rank nha ✨')).toBeTruthy();
    expect(getByText('Team Sao Băng')).toBeTruthy();
    expect(getByText('Team Rank')).toBeTruthy();
    expect(getByText('Cần Mid')).toBeTruthy();
    expect(getByText('Yue · Lorian')).toBeTruthy();
    expect(getByText('4/5')).toBeTruthy();
    expect(getByText('Lời mời Set')).toBeTruthy();
    expect(getByLabelText('Lời mời Set Team Sao Băng')).toBeTruthy();
    expect(
      getByLabelText('Lời mời Set Team Sao Băng').props.accessibilityRole,
    ).toBeUndefined();
    expect(getByPlaceholderText('Nhắn tin...')).toBeTruthy();
    expect(getByLabelText('Quay lại danh sách tin nhắn')).toBeTruthy();
    expect(queryByLabelText('Gọi cho Minh Anh')).toBeNull();
    expect(getByLabelText('Gửi tin nhắn')).toBeTruthy();
    expect(getByLabelText('Minh Anh đang nhập')).toBeTruthy();
  });

  it('uses one native IME owner with a stable viewport and sticky composer dock', async () => {
    const { getByTestId, queryByTestId } = await renderChatWithProviders(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 34, left: 0, right: 0, top: 24 },
        }}
      >
        <ChatConversationScreen conversationId="minh-anh" />
      </SafeAreaProvider>,
    );

    const chatScrollView = getByTestId('chat-message-list');
    const composerDock = getByTestId('chat-composer-dock');
    const composerDockContent = getByTestId('chat-composer-dock-content');

    expect(getByTestId('chat-message-viewport')).toBeTruthy();
    expect(getByTestId('chat-composer-content')).toBeTruthy();
    expect(queryByTestId('chat-keyboard-avoiding-view')).toBeNull();
    expect(queryByTestId('chat-composer-safe-area')).toBeNull();
    expect(chatScrollView.props.offset).toBe(34);
    expect(chatScrollView.props.keyboardLiftBehavior).toBe('whenAtEnd');
    expect(chatScrollView.props.extraContentPadding).toBeUndefined();
    expect(chatScrollView.props.automaticallyAdjustContentInsets).toBe(false);
    expect(chatScrollView.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(chatScrollView.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(composerDock.props.offset).toEqual({ closed: 0, opened: 34 });
    expect(StyleSheet.flatten(composerDockContent.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgba(3,7,17,0.98)',
        paddingBottom: 34,
      }),
    );
    expect(getByTestId('chat-message-list').props.keyboardDismissMode).toBe(
      Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    );
    expect(
      getByTestId('chat-message-list').props.automaticallyAdjustKeyboardInsets,
    ).toBe(false);
    expect(getByTestId('chat-message-list').props.initialNumToRender).toBe(61);
    expect(
      getByTestId('chat-message-list').props.maintainVisibleContentPosition,
    ).toEqual({ minIndexForVisible: 0 });
  });

  it('reserves composer space in normal flow instead of a synthetic inset', async () => {
    const { getByTestId } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="minh-anh" />,
    );
    const chatScrollView = getByTestId('chat-message-list');
    const composerDock = getByTestId('chat-composer-dock');
    const dockStyle = StyleSheet.flatten(composerDock.props.style);

    expect(chatScrollView.props.extraContentPadding).toBeUndefined();
    expect(dockStyle).toEqual(expect.objectContaining({ flexShrink: 0 }));
    expect(dockStyle?.position).not.toBe('absolute');
  });

  it('keeps a hydrated draft inside the stable viewport and composer dock', async () => {
    useChatRuntimeStore
      .getState()
      .hydrateDraft('minh-anh', 'Draft leo rank tối nay');

    const { getByTestId } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="minh-anh" />,
    );

    expect(getByTestId('chat-message-viewport')).toBeTruthy();
    expect(getByTestId('chat-composer-dock')).toBeTruthy();
    expect(getByTestId('chat-composer-input').props.value).toBe(
      'Draft leo rank tối nay',
    );
  });

  it('serializes keyboard-to-tray transition through the native controller', async () => {
    const dismiss = jest.mocked(KeyboardController.dismiss);
    const requestFrame = jest.spyOn(globalThis, 'requestAnimationFrame');
    const { getByLabelText, getByTestId, queryByLabelText } =
      await renderChatWithProviders(
        <ChatConversationScreen conversationId="minh-anh" />,
      );

    await fireEvent.press(getByLabelText('Chọn biểu cảm'));
    expect(dismiss).toHaveBeenCalledWith({
      animated: true,
      keepFocus: false,
    });
    await waitFor(() => expect(getByLabelText('Biểu cảm nhanh')).toBeTruthy());
    expect(getByTestId('chat-composer-focus-handoff')).toBeTruthy();

    await fireEvent.press(getByLabelText('Tiếp tục nhập tin nhắn'));
    await waitFor(() => expect(queryByLabelText('Biểu cảm nhanh')).toBeNull());
    expect(queryByLabelText('Tiếp tục nhập tin nhắn')).toBeNull();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('opens composer utilities and inserts a quick emoji into the draft', async () => {
    const { getByLabelText, getByPlaceholderText, queryByLabelText } =
      await renderChatWithProviders(
        <ChatConversationScreen conversationId="minh-anh" />,
      );

    await fireEvent.press(getByLabelText('Thêm nội dung'));
    expect(getByLabelText('Tuỳ chọn đính kèm')).toBeTruthy();
    expect(getByLabelText('Ảnh/video')).toBeTruthy();
    expect(getByLabelText('Camera')).toBeTruthy();
    expect(queryByLabelText('Mời vào set')).toBeNull();
    expect(queryByLabelText('Chia sẻ build')).toBeNull();

    await fireEvent.press(getByLabelText('Chọn biểu cảm'));
    expect(getByLabelText('Biểu cảm nhanh')).toBeTruthy();
    await fireEvent.press(getByLabelText('Chèn 💜'));
    expect(getByPlaceholderText('Nhắn tin...').props.value).toBe('💜');

    expect(queryByLabelText('Gửi tin nhắn thoại')).toBeNull();
  });

  it('reserves image geometry, shows upload state, and opens the media viewer', async () => {
    mockImageSelection();
    const pending = deferred<SendChatMediaReceipt>();
    let clientMessageId = '';
    const messageTransport: ChatMessageTransport = {
      sendMedia(input) {
        clientMessageId = input.clientMessageId;
        return pending.promise;
      },
      async sendText(input) {
        return { clientMessageId: input.clientMessageId };
      },
    };
    const { getByLabelText, getByTestId, getByText, queryByTestId } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={messageTransport}
        />,
      );

    await fireEvent.press(getByLabelText('Thêm nội dung'));
    await fireEvent.press(getByLabelText('Ảnh/video'));
    await waitFor(() =>
      expect(getByLabelText('Media đã chọn: ảnh')).toBeTruthy(),
    );
    expect(getByText('Đang xử lý…')).toBeTruthy();
    expect(getByLabelText('Gửi tin nhắn').props.accessibilityState).toEqual({
      disabled: true,
    });
    await waitFor(() => expect(getByText('Ảnh đã sẵn sàng gửi.')).toBeTruthy());
    expect(getByText('1200 × 900')).toBeTruthy();

    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(getByLabelText('Hủy gửi media')).toBeTruthy());
    const media = getByLabelText(/^Ảnh do bạn gửi/);
    const mediaStyle = StyleSheet.flatten(media.props.style);
    expect(mediaStyle.width).toBeLessThanOrEqual(340);
    expect(mediaStyle.height).toBeCloseTo(mediaStyle.width * 0.75, 0);

    await act(async () => {
      pending.resolve({
        acceptedAt: '2026-07-11T12:32:00.000Z',
        canonicalMessageId: 'canonical-media-1',
        clientMessageId,
      });
      await pending.promise;
    });
    await waitFor(() => expect(getByLabelText(/, Đã gửi$/)).toBeTruthy(), {
      timeout: 1800,
    });
    const latest = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);
    expect(latest?.kind).toBe('media');
    if (latest?.kind === 'media') {
      expect(latest.attachment).toEqual(
        expect.objectContaining({
          fileSize: 1200,
          height: 900,
          mimeType: 'image/jpeg',
          thumbnailUri: 'file:///rank.jpg',
          width: 1200,
        }),
      );
    }

    await fireEvent.press(media);
    expect(getByTestId('chat-media-viewer')).toBeTruthy();
    expect(getByLabelText('Đóng trình xem media')).toBeTruthy();
    expect(getByLabelText('Chia sẻ media')).toBeTruthy();
    expect(getByLabelText('Lưu media')).toBeTruthy();
    const zoomScroller = getByTestId('chat-media-zoom-scroller');
    expect(zoomScroller.props.minimumZoomScale).toBe(1);
    expect(zoomScroller.props.maximumZoomScale).toBe(4);
    expect(zoomScroller.props.pinchGestureEnabled).toBe(true);
    expect(getByTestId('chat-media-gesture-surface')).toBeTruthy();
    await fireEvent.press(getByLabelText('Đóng trình xem media'));
    expect(queryByTestId('chat-media-viewer')).toBeNull();
  });

  it('keeps a cancelled media bubble stable until the user removes it', async () => {
    mockImageSelection();
    const pending = deferred<SendChatMediaReceipt>();
    const messageTransport: ChatMessageTransport = {
      sendMedia: () => pending.promise,
      async sendText(input) {
        return { clientMessageId: input.clientMessageId };
      },
    };
    const { getByLabelText, getByText } = await renderChatWithProviders(
      <ChatConversationScreen
        conversationId="minh-anh"
        messageTransport={messageTransport}
      />,
    );

    await fireEvent.press(getByLabelText('Thêm nội dung'));
    await fireEvent.press(getByLabelText('Ảnh/video'));
    await waitFor(() => expect(getByText('Ảnh đã sẵn sàng gửi.')).toBeTruthy());
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(getByLabelText('Hủy gửi media')).toBeTruthy());
    const messageBeforeCancel = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);

    await fireEvent.press(getByLabelText('Hủy gửi media'));
    await waitFor(() => expect(getByText('Đã hủy tải lên')).toBeTruthy());
    const messageAfterCancel = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);
    expect(messageAfterCancel?.id).toBe(messageBeforeCancel?.id);
    expect(messageAfterCancel?.deliveryStatus).toBe('failed');
    expect(
      messageAfterCancel?.kind === 'media'
        ? messageAfterCancel.mediaFailureReason
        : undefined,
    ).toBe('cancelled');

    await fireEvent.press(getByLabelText('Xóa media khỏi cuộc trò chuyện'));
    expect(
      useChatRuntimeStore.getState().messagesByConversation['minh-anh'] ?? [],
    ).toHaveLength(0);
  });

  it('retries a failed media send without creating a second bubble', async () => {
    mockImageSelection();
    const scenario = createChatScenarioController({ failNextMedia: 'unknown' });
    const { getByLabelText, getByText } = await renderChatWithProviders(
      <ChatConversationScreen
        conversationId="minh-anh"
        messageTransport={scenario.transport}
      />,
    );

    await fireEvent.press(getByLabelText('Thêm nội dung'));
    await fireEvent.press(getByLabelText('Ảnh/video'));
    await waitFor(() => expect(getByText('Ảnh đã sẵn sàng gửi.')).toBeTruthy());
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(getByText('Không thể gửi')).toBeTruthy(), {
      timeout: 1800,
    });
    const failedMessage = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);

    await fireEvent.press(getByLabelText('Thử lại media'));
    await waitFor(() => expect(getByLabelText(/, Đã gửi$/)).toBeTruthy(), {
      timeout: 1800,
    });
    const messages =
      useChatRuntimeStore.getState().messagesByConversation['minh-anh'] ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe(failedMessage?.id);
  });

  it('renders session timestamps and exposes initial scroll anchors', async () => {
    const { getAllByLabelText, getByTestId } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="minh-anh" />,
    );
    const list = getByTestId('chat-message-list');

    expect(getAllByLabelText(/^Mốc thời gian /).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(typeof list.props.onLayout).toBe('function');
    expect(typeof list.props.onContentSizeChange).toBe('function');
    await fireEvent(list, 'layout', {
      nativeEvent: { layout: { height: 600, width: 360, x: 0, y: 0 } },
    });
  });

  it('anchors a short conversation near the composer', async () => {
    const { getByTestId } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="khoa-jungle" />,
    );

    expect(
      StyleSheet.flatten(
        getByTestId('chat-message-list').props.contentContainerStyle,
      ),
    ).toEqual(
      expect.objectContaining({ flexGrow: 1, justifyContent: 'flex-end' }),
    );
  });

  it('requests an older page at the top while preserving the visible anchor', async () => {
    const baseRepository = createLocalChatRepository({ pageSize: 3 });
    const getMessagePage = jest.fn(baseRepository.getMessagePage);
    const repository = { ...baseRepository, getMessagePage };
    const { getByTestId } = await renderChatWithProviders(
      <ChatConversationScreen
        conversationId="minh-anh"
        repository={repository}
      />,
    );
    const list = getByTestId('chat-message-list');

    await waitFor(() => expect(getMessagePage).toHaveBeenCalledTimes(1));
    expect(list.props.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    await fireEvent(list, 'contentSizeChange', 360, 900);
    await fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { x: 0, y: 0 },
        contentSize: { height: 900, width: 360 },
        layoutMeasurement: { height: 600, width: 360 },
      },
    });

    await waitFor(() => expect(getMessagePage).toHaveBeenCalledTimes(2));
    expect(getMessagePage.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ cursor: expect.any(String) }),
    );
  });

  it('renders a gaming build card for Khoa Jungle', async () => {
    const { getByLabelText, getByText, queryByText } =
      await renderChatWithProviders(
        <ChatConversationScreen conversationId="khoa-jungle" />,
      );

    expect(getByText('Khoa Jungle')).toBeTruthy();
    expect(getByText('Nakroth · Đi Rừng')).toBeTruthy();
    expect(getByText('Xuyên giáp')).toBeTruthy();
    expect(getByText('Chi tiết build')).toBeTruthy();
    expect(getByLabelText('Build Nakroth · Đi Rừng')).toBeTruthy();
    expect(
      getByLabelText('Build Nakroth · Đi Rừng').props.accessibilityRole,
    ).toBeUndefined();
    expect(queryByText('Bạn bè')).toBeNull();
  });

  it('follows a long conversation after the target bubble layout is committed', async () => {
    const pending = deferred<SendChatTextReceipt>();
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
    const frames = mockAnimationFrameQueue();
    jest
      .mocked(KeyboardController.state)
      .mockReturnValue({ ...closedKeyboardState, height: 334 });
    const messageTransport: ChatMessageTransport = {
      sendText: () => pending.promise,
    };
    const { getByLabelText, getByPlaceholderText, getByTestId, getByText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={messageTransport}
        />,
      );
    const list = getByTestId('chat-message-list');

    await fireEvent(list, 'contentSizeChange', 360, 900);
    scrollToEnd.mockClear();

    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Theo dõi tin mới',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    expect(getByText('Theo dõi tin mới')).toBeTruthy();
    expect(scrollToEnd).not.toHaveBeenCalled();

    const target = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);
    expect(target).toBeTruthy();
    await fireEvent(getByTestId(`chat-message-row-${target!.id}`), 'layout', {
      nativeEvent: {
        layout: { height: 48, width: 320, x: 0, y: 0 },
      },
    });
    expect(scrollToEnd).not.toHaveBeenCalled();
    expect(frames.pendingCount).toBe(1);

    await frames.runNext();
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
    expect(frames.pendingCount).toBe(1);

    await fireEvent(list, 'contentSizeChange', 360, 980);
    await frames.runNext();
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });
    expect(scrollToEnd).toHaveBeenCalledTimes(2);

    const keyboardEndInset = 334 - list.props.offset;
    await fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { x: 0, y: 980 - 600 + keyboardEndInset },
        contentSize: { height: 980, width: 360 },
        layoutMeasurement: { height: 600, width: 360 },
      },
    });
    await fireEvent(list, 'contentSizeChange', 360, 1_000);
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
  });

  it('follows a short conversation even when appending does not change content size', async () => {
    const pending = deferred<SendChatTextReceipt>();
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
    const frames = mockAnimationFrameQueue();
    jest
      .mocked(KeyboardController.state)
      .mockReturnValue({ ...closedKeyboardState, height: 334 });
    const messageTransport: ChatMessageTransport = {
      sendText: () => pending.promise,
    };
    const { getByLabelText, getByPlaceholderText, getByTestId } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="khoa-jungle"
          messageTransport={messageTransport}
        />,
      );
    const list = getByTestId('chat-message-list');

    await fireEvent(list, 'contentSizeChange', 360, 600);
    scrollToEnd.mockClear();
    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Kéo theo bubble ngắn',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));

    const target = useChatRuntimeStore
      .getState()
      .messagesByConversation['khoa-jungle']?.at(-1);
    expect(target).toBeTruthy();
    const targetItem = list.props.data.find(
      (item: { kind: string; message?: { id?: string } }) =>
        item.kind === 'message' && item.message?.id === target?.id,
    );
    expect(targetItem).toBeTruthy();

    await act(async () => {
      list.props.onViewableItemsChanged({
        viewableItems: [
          {
            index: list.props.data.indexOf(targetItem),
            isViewable: true,
            item: targetItem,
            key: targetItem.id,
          },
        ],
      });
    });
    expect(scrollToEnd).not.toHaveBeenCalled();

    await fireEvent(getByTestId(`chat-message-row-${target!.id}`), 'layout', {
      nativeEvent: {
        layout: { height: 48, width: 320, x: 0, y: 0 },
      },
    });
    expect(scrollToEnd).not.toHaveBeenCalled();

    await frames.runNext();
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });

    // No contentSizeChange is emitted for a flexGrow short thread. The second
    // frame must still correct a native clamp to the pre-append scroll range.
    await frames.runNext();
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });

    const keyboardEndInset = 334 - list.props.offset;
    await fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { x: 0, y: keyboardEndInset },
        contentSize: { height: 600, width: 360 },
        layoutMeasurement: { height: 600, width: 360 },
      },
    });
    await fireEvent(getByTestId(`chat-message-row-${target!.id}`), 'layout', {
      nativeEvent: {
        layout: { height: 48, width: 320, x: 0, y: 0 },
      },
    });
    expect(frames.pendingCount).toBe(0);
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
  });

  it.each(writableConversationIds)(
    'uses target-bubble auto-follow for %s',
    async (conversationId) => {
      const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
      const frames = mockAnimationFrameQueue();
      jest
        .mocked(KeyboardController.state)
        .mockReturnValue({ ...closedKeyboardState, height: 334 });
      const messageTransport: ChatMessageTransport = {
        async sendText(input) {
          return { clientMessageId: input.clientMessageId };
        },
      };
      const { getByLabelText, getByPlaceholderText, getByTestId, unmount } =
        await renderChatWithProviders(
          <ChatConversationScreen
            conversationId={conversationId}
            messageTransport={messageTransport}
          />,
        );
      const list = getByTestId('chat-message-list');

      await fireEvent(list, 'contentSizeChange', 360, 600);
      scrollToEnd.mockClear();
      await fireEvent.changeText(
        getByPlaceholderText('Nhắn tin...'),
        `Follow ${conversationId}`,
      );
      await fireEvent.press(getByLabelText('Gửi tin nhắn'));

      const target = useChatRuntimeStore
        .getState()
        .messagesByConversation[conversationId]?.at(-1);
      expect(target).toBeTruthy();
      await fireEvent(getByTestId(`chat-message-row-${target!.id}`), 'layout', {
        nativeEvent: {
          layout: { height: 48, width: 320, x: 0, y: 0 },
        },
      });
      await frames.runNext();

      expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
      await unmount();
    },
  );

  it('cancels stale follow frames when the route changes conversation', async () => {
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
    const frames = mockAnimationFrameQueue();
    const messageTransport: ChatMessageTransport = {
      async sendText(input) {
        return { clientMessageId: input.clientMessageId };
      },
    };
    let changeConversation: (conversationId: string) => void = () => {
      throw new Error('Route harness is not mounted.');
    };

    function RouteHarness() {
      const [conversationId, setConversationId] = useState('minh-anh');
      changeConversation = setConversationId;
      return (
        <ChatConversationScreen
          conversationId={conversationId}
          messageTransport={messageTransport}
        />
      );
    }

    const { getByLabelText, getByPlaceholderText, getByTestId, getByText } =
      await renderChatWithProviders(<RouteHarness />);
    const minhList = getByTestId('chat-message-list');
    await fireEvent(minhList, 'contentSizeChange', 360, 900);
    scrollToEnd.mockClear();

    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Tin đang chờ frame cũ',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    const minhTarget = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);
    expect(minhTarget).toBeTruthy();
    await fireEvent(
      getByTestId(`chat-message-row-${minhTarget!.id}`),
      'layout',
      {
        nativeEvent: {
          layout: { height: 48, width: 320, x: 0, y: 0 },
        },
      },
    );
    expect(frames.pendingCount).toBe(1);

    await act(async () => {
      changeConversation('khoa-jungle');
    });
    await waitFor(() => expect(getByText('Khoa Jungle')).toBeTruthy());
    expect(frames.pendingCount).toBe(0);
    expect(scrollToEnd).not.toHaveBeenCalled();

    const khoaList = getByTestId('chat-message-list');
    await fireEvent(khoaList, 'contentSizeChange', 360, 600);
    scrollToEnd.mockClear();
    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Follow session mới',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    const khoaTarget = useChatRuntimeStore
      .getState()
      .messagesByConversation['khoa-jungle']?.at(-1);
    expect(khoaTarget).toBeTruthy();
    await fireEvent(
      getByTestId(`chat-message-row-${khoaTarget!.id}`),
      'layout',
      {
        nativeEvent: {
          layout: { height: 48, width: 320, x: 0, y: 0 },
        },
      },
    );
    await frames.runNext();

    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
  });

  it('cancels pending auto-follow when the user starts dragging', async () => {
    const pending = deferred<SendChatTextReceipt>();
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd');
    const messageTransport: ChatMessageTransport = {
      sendText: () => pending.promise,
    };
    const { getByLabelText, getByPlaceholderText, getByTestId } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={messageTransport}
        />,
      );
    const list = getByTestId('chat-message-list');

    await fireEvent(list, 'contentSizeChange', 360, 900);
    scrollToEnd.mockClear();
    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Không giành quyền kéo',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));
    const target = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);
    expect(target).toBeTruthy();
    await fireEvent(list, 'scrollBeginDrag', { nativeEvent: {} });
    await fireEvent(getByTestId(`chat-message-row-${target!.id}`), 'layout', {
      nativeEvent: {
        layout: { height: 48, width: 320, x: 0, y: 0 },
      },
    });

    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it('moves an optimistic multiline message from sending to sent', async () => {
    const pending = deferred<SendChatTextReceipt>();
    const calls: Parameters<ChatMessageTransport['sendText']>[0][] = [];
    const messageTransport: ChatMessageTransport = {
      sendText: (input) => {
        calls.push(input);
        return pending.promise;
      },
    };
    const { getByLabelText, getByPlaceholderText, getByText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={messageTransport}
        />,
      );
    const composer = getByPlaceholderText('Nhắn tin...');

    await fireEvent.changeText(composer, `  Dòng một\nDòng hai  `);
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));

    expect(getByText(`Dòng một\nDòng hai`)).toBeTruthy();
    expect(getByLabelText('Đang gửi')).toBeTruthy();
    expect(composer.props.value).toBe('');
    expect(calls[0]?.text).toBe(`Dòng một\nDòng hai`);
    const runtimeMessage =
      useChatRuntimeStore.getState().messagesByConversation['minh-anh']?.[0];
    expect(runtimeMessage?.kind).toBe('text');
    expect(
      runtimeMessage?.kind === 'text' ? runtimeMessage.text : undefined,
    ).toBe(
      `Dòng một
Dòng hai`,
    );

    await act(async () => {
      pending.resolve({
        acceptedAt: '2026-07-11T12:30:00.000Z',
        canonicalMessageId: 'message-1',
        clientMessageId: calls[0]!.clientMessageId,
      });
      await pending.promise;
    });

    expect(getByLabelText('Đã gửi')).toBeTruthy();
  });

  it('passes the route conversation id through the transport contract', async () => {
    const calls: Parameters<ChatMessageTransport['sendText']>[0][] = [];
    const conversationId = 'minh-anh';
    const messageTransport: ChatMessageTransport = {
      async sendText(input) {
        calls.push(input);
        return {
          acceptedAt: '2026-07-11T12:30:00.000Z',
          canonicalMessageId: 'canonical-message',
          clientMessageId: input.clientMessageId,
        };
      },
    };
    const { getByLabelText, getByPlaceholderText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId={conversationId}
          messageTransport={messageTransport}
        />,
      );

    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Tin nhắn thật',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(getByLabelText('Đã gửi')).toBeTruthy());
    expect(calls[0]?.conversationId).toBe(conversationId);
  });

  it('rejects a receipt for a different client message', async () => {
    const messageTransport: ChatMessageTransport = {
      async sendText() {
        return { clientMessageId: 'another-client-message' };
      },
    };
    const { getByLabelText, getByPlaceholderText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={messageTransport}
        />,
      );

    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Kiểm tra receipt',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(getByLabelText('Không gửi được')).toBeTruthy());
  });

  it('shows a retry action after failure and resends the same message', async () => {
    let attempts = 0;
    const commands: Parameters<ChatMessageTransport['sendText']>[0][] = [];
    const messageTransport: ChatMessageTransport = {
      async sendText(input) {
        commands.push(input);
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return {
          acceptedAt: '2026-07-11T12:31:00.000Z',
          canonicalMessageId: 'message-2',
          clientMessageId: input.clientMessageId,
        };
      },
    };
    const { getByLabelText, getByPlaceholderText, getByText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={messageTransport}
        />,
      );

    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Gửi lại giúp mình',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(getByLabelText('Không gửi được')).toBeTruthy());
    expect(getByText('Gửi lại giúp mình')).toBeTruthy();

    await fireEvent.press(getByLabelText('Gửi lại tin nhắn'));

    await waitFor(() => expect(getByLabelText('Đã gửi')).toBeTruthy());
    expect(attempts).toBe(2);
    expect(commands[1]?.clientMessageId).toBe(commands[0]?.clientMessageId);
    expect(commands[1]?.clientCreatedAt).toBe(commands[0]?.clientCreatedAt);
  });

  it('debounces draft persistence and flushes the latest value on blur', async () => {
    const setItem = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockResolvedValue(undefined);
    const { getByPlaceholderText } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="khoa-jungle" />,
    );
    const input = getByPlaceholderText('Nhắn tin...');

    await fireEvent.changeText(input, 'Draft build');
    await fireEvent.changeText(input, 'Draft build Nakroth');
    expect(setItem).not.toHaveBeenCalledWith(
      chatDraftStorageKey('khoa-jungle'),
      expect.any(String),
    );

    await fireEvent(input, 'blur');

    await waitFor(() =>
      expect(setItem).toHaveBeenCalledWith(
        chatDraftStorageKey('khoa-jungle'),
        'Draft build Nakroth',
      ),
    );
    expect(setItem).toHaveBeenCalledWith(
      CHAT_DRAFT_INDEX_STORAGE_KEY,
      expect.stringContaining('Draft build Nakroth'),
    );
  });

  it('hydrates a persisted draft without remounting or resetting focus state', async () => {
    const pendingDraft = deferred<string | null>();
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValue(pendingDraft.promise);
    const requestFrame = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const { getByTestId } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="khoa-jungle" />,
    );
    const inputBeforeHydration = getByTestId('chat-composer-input');

    await act(async () => {
      pendingDraft.resolve('Draft build Nakroth');
      await pendingDraft.promise;
    });

    await waitFor(() =>
      expect(getByTestId('chat-composer-input').props.value).toBe(
        'Draft build Nakroth',
      ),
    );
    const inputAfterHydration = getByTestId('chat-composer-input');
    expect(inputAfterHydration).toBe(inputBeforeHydration);
    expect(inputAfterHydration.props.selection).toEqual({
      end: 'Draft build Nakroth'.length,
      start: 'Draft build Nakroth'.length,
    });

    requestFrame.mockClear();
    await fireEvent(inputAfterHydration, 'focus');

    expect(getByTestId('chat-composer-input').props.value).toBe(
      'Draft build Nakroth',
    );
    expect(getByTestId('chat-composer-input').props.selection).toEqual({
      end: 'Draft build Nakroth'.length,
      start: 'Draft build Nakroth'.length,
    });
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('does not subscribe to React Native keyboard layout events', async () => {
    const addListener = jest.spyOn(Keyboard, 'addListener');
    const { unmount } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="minh-anh" />,
    );

    expect(addListener).not.toHaveBeenCalled();
    await unmount();
    expect(addListener).not.toHaveBeenCalled();
  });

  it('renders an explicit not-found state instead of falling back to another thread', async () => {
    const { getByLabelText, queryByPlaceholderText, queryByText } =
      await renderChatWithProviders(
        <ChatConversationScreen conversationId="missing-conversation" />,
      );

    await waitFor(() =>
      expect(getByLabelText('Không tìm thấy cuộc trò chuyện')).toBeTruthy(),
    );
    expect(queryByPlaceholderText('Nhắn tin...')).toBeNull();
    expect(queryByText('Minh Anh')).toBeNull();
  });

  it('retries an unavailable conversation in place without navigating away', async () => {
    const baseRepository = createLocalChatRepository();
    let attempts = 0;
    const repository = {
      ...baseRepository,
      async getConversation(
        ...args: Parameters<typeof baseRepository.getConversation>
      ) {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary-unavailable');
        return baseRepository.getConversation(...args);
      },
    };
    const { getByLabelText, getByText } = await renderChatWithProviders(
      <ChatConversationScreen
        conversationId="minh-anh"
        repository={repository}
      />,
    );

    await waitFor(() =>
      expect(getByLabelText('Không thể tải cuộc trò chuyện')).toBeTruthy(),
    );
    await fireEvent.press(getByLabelText('Thử tải lại cuộc trò chuyện'));

    await waitFor(() => expect(getByText('Minh Anh')).toBeTruthy());
    expect(attempts).toBe(2);
  });

  it('hides composer actions that the conversation capability contract forbids', async () => {
    const baseRepository = createLocalChatRepository();
    const repository = {
      ...baseRepository,
      async getConversation(
        ...args: Parameters<typeof baseRepository.getConversation>
      ) {
        const response = await baseRepository.getConversation(...args);
        if (!response) return null;
        return {
          ...response,
          data: {
            ...response.data,
            capabilities: {
              ...response.data.capabilities,
              composerActions: response.data.capabilities.composerActions.map(
                (action) => ({ ...action, state: 'hidden' as const }),
              ),
            },
          },
        };
      },
    };
    const { queryByLabelText, getByPlaceholderText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          repository={repository}
        />,
      );

    await waitFor(() =>
      expect(getByPlaceholderText('Nhắn tin...')).toBeTruthy(),
    );
    expect(queryByLabelText('Thêm nội dung')).toBeNull();
    expect(queryByLabelText('Gửi tin nhắn thoại')).toBeNull();
  });

  it('queues an offline message and flushes it when the deterministic transport reconnects', async () => {
    const scenario = createChatScenarioController({ network: 'offline' });
    const { getByLabelText, getByPlaceholderText, queryByLabelText } =
      await renderChatWithProviders(
        <ChatConversationScreen
          conversationId="minh-anh"
          messageTransport={scenario.transport}
        />,
      );

    expect(
      getByLabelText('Ngoại tuyến · Tin mới sẽ được xếp hàng'),
    ).toBeTruthy();

    await fireEvent.changeText(
      getByPlaceholderText('Nhắn tin...'),
      'Gửi khi có mạng',
    );
    await fireEvent.press(getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(getByLabelText('Đang chờ mạng')).toBeTruthy());
    expect(
      getByLabelText('Ngoại tuyến · 1 tin sẽ tự gửi khi có mạng'),
    ).toBeTruthy();
    const queuedMessage = useChatRuntimeStore
      .getState()
      .messagesByConversation['minh-anh']?.at(-1);
    expect(queuedMessage?.deliveryStatus).toBe('queued');

    await act(async () => {
      scenario.setNetworkState('online');
      await Promise.resolve();
    });

    await waitFor(() => expect(getByLabelText('Đã gửi')).toBeTruthy());
    await waitFor(() =>
      expect(queryByLabelText(/Ngoại tuyến|Đang gửi lại/)).toBeNull(),
    );
    expect(
      useChatRuntimeStore.getState().messagesByConversation['minh-anh']?.at(-1)
        ?.id,
    ).toBe(queuedMessage?.id);
  });

  it('keeps automated notifications read-only', async () => {
    const {
      getByLabelText,
      getByText,
      queryByLabelText,
      queryByPlaceholderText,
    } = await renderChatWithProviders(
      <ChatConversationScreen conversationId="system" />,
    );

    expect(getByText('Thông báo')).toBeTruthy();
    expect(getByLabelText('Thông báo này không hỗ trợ trả lời')).toBeTruthy();
    expect(queryByLabelText('Gọi cho Hệ thống')).toBeNull();
    expect(queryByPlaceholderText('Nhắn tin...')).toBeNull();
  });
});
