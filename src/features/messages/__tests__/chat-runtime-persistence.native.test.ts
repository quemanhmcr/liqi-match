import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  chatPendingMessageStorageKey,
  flushChatPendingMessagePersistence,
  resetChatPendingMessagePersistenceForTests,
  setChatPendingMessagePersistenceScope,
  useChatRuntimeStore,
} from '@/features/messages/model/chat-runtime-store';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('71000000-0000-4000-8000-000000000001'),
}));

const accountId = '01000000-0000-4000-8000-000000000401';
const conversationId = '90000000-0000-4000-8000-000000000401';

describe('pending chat message restart persistence', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetChatPendingMessagePersistenceForTests();
  });

  afterEach(async () => {
    await resetChatPendingMessagePersistenceForTests();
  });

  it('hydrates an interrupted send as queued with the same clientMessageId', async () => {
    const setItem = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockResolvedValue(undefined);
    jest.spyOn(AsyncStorage, 'removeItem').mockResolvedValue(undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
    await setChatPendingMessagePersistenceScope(accountId);
    setItem.mockClear();

    const original = useChatRuntimeStore.getState().enqueueOutgoingText({
      conversationId,
      createdAt: '2026-07-14T08:00:00.000Z',
      text: 'Retry after restart',
    });
    await flushChatPendingMessagePersistence();
    const persisted = String(setItem.mock.calls.at(-1)?.[1]);

    await resetChatPendingMessagePersistenceForTests();
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(persisted);
    await setChatPendingMessagePersistenceScope(accountId);

    expect(
      useChatRuntimeStore.getState().messagesByConversation[conversationId],
    ).toEqual([
      expect.objectContaining({
        deliveryStatus: 'queued',
        id: original.id,
        text: 'Retry after restart',
      }),
    ]);
  });

  it('removes a pending entry from disk after a canonical sent receipt', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);
    jest.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined);
    const removeItem = jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockResolvedValue(undefined);
    await setChatPendingMessagePersistenceScope(accountId);
    removeItem.mockClear();

    const message = useChatRuntimeStore.getState().enqueueOutgoingText({
      conversationId,
      createdAt: '2026-07-14T08:00:00.000Z',
      text: 'Already committed',
    });
    useChatRuntimeStore
      .getState()
      .patchOutgoingMessage(conversationId, message.id, {
        canonicalId: '91000000-0000-4000-8000-000000000001',
        deliveryStatus: 'sent',
        sequence: 1,
      });
    await flushChatPendingMessagePersistence();

    expect(removeItem).toHaveBeenCalledWith(
      chatPendingMessageStorageKey(accountId),
    );
  });
});
