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
  CHAT_DRAFT_INDEX_STORAGE_KEY,
  chatDraftStorageKey,
  clearChatDraft,
  flushChatDraft,
  loadChatDraftIndex,
  resetChatDraftPersistenceForTests,
  saveChatDraft,
  scheduleChatDraftSave,
} from '@/features/messages/model/chat-draft-store';

describe('chat draft persistence', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    resetChatDraftPersistenceForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetChatDraftPersistenceForTests();
  });

  it('debounces rapid changes and persists only the latest full draft plus index', async () => {
    jest.useFakeTimers();
    const setItem = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockResolvedValue(undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);

    scheduleChatDraftSave('minh-anh', 'Draft cũ', 300);
    scheduleChatDraftSave('minh-anh', 'Draft mới nhất', 300);

    expect(setItem).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(300);
    await flushChatDraft('minh-anh');

    expect(setItem).toHaveBeenCalledWith(
      chatDraftStorageKey('minh-anh'),
      'Draft mới nhất',
    );
    expect(setItem).not.toHaveBeenCalledWith(
      chatDraftStorageKey('minh-anh'),
      'Draft cũ',
    );
    const indexCall = setItem.mock.calls.find(
      ([key]) => key === CHAT_DRAFT_INDEX_STORAGE_KEY,
    );
    expect(JSON.parse(String(indexCall?.[1]))).toEqual(
      expect.objectContaining({
        'minh-anh': expect.objectContaining({
          hasAttachments: false,
          preview: 'Draft mới nhất',
        }),
      }),
    );
  });

  it('serializes index updates from multiple conversations without lost entries', async () => {
    const setItem = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockResolvedValue(undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null);

    await Promise.all([
      saveChatDraft('minh-anh', 'Draft Minh Anh', 10),
      saveChatDraft('khoa-jungle', 'Draft Khoa', 20),
    ]);

    const indexPayloads = setItem.mock.calls
      .filter(([key]) => key === CHAT_DRAFT_INDEX_STORAGE_KEY)
      .map(([, value]) => JSON.parse(String(value)) as Record<string, unknown>);
    expect(indexPayloads.at(-1)).toEqual(
      expect.objectContaining({
        'khoa-jungle': expect.any(Object),
        'minh-anh': expect.any(Object),
      }),
    );
  });

  it('falls back to an empty index for corrupt storage', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue('{not-json');

    await expect(loadChatDraftIndex()).resolves.toEqual({});
  });

  it('clears both the full draft and its index entry', async () => {
    const removeItem = jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockResolvedValue(undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(
      JSON.stringify({
        'minh-anh': {
          hasAttachments: false,
          preview: 'Draft',
          updatedAt: 10,
        },
      }),
    );

    await clearChatDraft('minh-anh');

    expect(removeItem).toHaveBeenCalledWith(chatDraftStorageKey('minh-anh'));
    expect(removeItem).toHaveBeenCalledWith(CHAT_DRAFT_INDEX_STORAGE_KEY);
  });
});
