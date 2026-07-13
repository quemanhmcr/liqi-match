import { beforeEach, describe, expect, it } from '@jest/globals';

import { createProductionSimulationRuntime } from '@/entities/simulation';
import {
  CHAT_DRAFT_INDEX_STORAGE_KEY,
  chatDraftStorageKey,
  resetChatDraftPersistenceState,
} from '../model/chat-draft-store';
import {
  resetChatRuntimeStore,
  setRuntimeChatDraft,
  useChatRuntimeStore,
} from '../model/chat-runtime-store';
import { createMessagesSimulationResetParticipant } from '../runtime/messages-simulation-reset';

let storage: Map<string, string>;
const storagePort = {
  async getItem(key: string) {
    return storage.get(key) ?? null;
  },
  async removeItem(key: string) {
    storage.delete(key);
  },
  async setItem(key: string, value: string) {
    storage.set(key, value);
  },
};

beforeEach(() => {
  storage = new Map();
  resetChatDraftPersistenceState();
  resetChatRuntimeStore();
});

describe('Messages simulation reset participant', () => {
  it('clears and restores persisted drafts through runtime snapshots', async () => {
    const runtime = createProductionSimulationRuntime({
      namespace: 'messages-reset-participant',
    });
    runtime.registerResetParticipant(
      createMessagesSimulationResetParticipant(
        'messages.test-reset',
        storagePort,
      ),
    );
    storage.set(
      CHAT_DRAFT_INDEX_STORAGE_KEY,
      JSON.stringify({ 'conversation:test': 123 }),
    );
    storage.set(
      chatDraftStorageKey('conversation:test'),
      'Draft before snapshot',
    );
    setRuntimeChatDraft('conversation:test', 'Draft before snapshot');
    const snapshot = await runtime.snapshot();

    await runtime.reset();

    expect(
      storage.get(chatDraftStorageKey('conversation:test')),
    ).toBeUndefined();
    expect(
      useChatRuntimeStore.getState().draftsByConversation['conversation:test'],
    ).toBeUndefined();

    await runtime.restore(snapshot);

    expect(storage.get(chatDraftStorageKey('conversation:test'))).toBe(
      'Draft before snapshot',
    );
  });

  it('does not remove unrelated storage entries', async () => {
    const runtime = createProductionSimulationRuntime({
      namespace: 'messages-reset-storage-scope',
    });
    runtime.registerResetParticipant(
      createMessagesSimulationResetParticipant(
        'messages.test-storage-scope',
        storagePort,
      ),
    );
    storage.set('unrelated:key', 'preserve');
    storage.set(
      CHAT_DRAFT_INDEX_STORAGE_KEY,
      JSON.stringify({ 'conversation:test': 123 }),
    );
    storage.set(chatDraftStorageKey('conversation:test'), 'Remove me');

    await runtime.reset();

    expect(storage.get('unrelated:key')).toBe('preserve');
    expect(
      storage.get(chatDraftStorageKey('conversation:test')),
    ).toBeUndefined();
  });
});
