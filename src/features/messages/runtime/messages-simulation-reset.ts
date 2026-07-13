import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  SimulationJsonValue,
  SimulationResetParticipant,
} from '@/shared/simulation';

import {
  CHAT_DRAFT_INDEX_STORAGE_KEY,
  CHAT_DRAFT_STORAGE_PREFIX,
  chatDraftStorageKey,
  flushAllChatDrafts,
  resetChatDraftPersistenceState,
} from '../model/chat-draft-store';
import { resetChatRuntimeStore } from '../model/chat-runtime-store';

type DraftStoragePort = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;

type MessagesSimulationResetSnapshot = {
  entries: Record<string, string>;
  version: 1;
};

/**
 * Feature-owned reset participant for transient chat UI and persisted drafts.
 * The simulation runtime only sees the generic participant contract.
 */
export function createMessagesSimulationResetParticipant(
  key = 'messages.ui-and-drafts',
  storage: DraftStoragePort = AsyncStorage,
): SimulationResetParticipant<SimulationJsonValue> {
  return {
    key,
    order: -200,
    reset: () => resetMessagesSimulationState(storage),
    restore: (state) => restoreMessagesSimulationState(state, storage),
    snapshot: () => snapshotMessagesSimulationState(storage),
  };
}

export async function resetMessagesSimulationState(
  storage: DraftStoragePort = AsyncStorage,
) {
  resetChatDraftPersistenceState();
  resetChatRuntimeStore();
  const keys = await chatDraftStorageKeys(storage);
  await Promise.all(keys.map((key) => storage.removeItem(key)));
  resetChatDraftPersistenceState();
}

async function snapshotMessagesSimulationState(
  storage: DraftStoragePort,
): Promise<SimulationJsonValue> {
  await flushAllChatDrafts();
  const keys = await chatDraftStorageKeys(storage);
  const pairs = await Promise.all(
    keys.map(async (key) => [key, await storage.getItem(key)] as const),
  );
  const entries = Object.fromEntries(
    pairs.flatMap(([key, value]) =>
      value === null ? [] : [[key, value] as const],
    ),
  );
  return { entries, version: 1 } satisfies MessagesSimulationResetSnapshot;
}

async function restoreMessagesSimulationState(
  state: SimulationJsonValue,
  storage: DraftStoragePort,
) {
  const snapshot = parseSnapshot(state);
  await resetMessagesSimulationState(storage);
  await Promise.all(
    Object.entries(snapshot.entries).map(([key, value]) =>
      storage.setItem(key, value),
    ),
  );
  resetChatDraftPersistenceState();
}

async function chatDraftStorageKeys(storage: DraftStoragePort) {
  const indexRaw = await storage.getItem(CHAT_DRAFT_INDEX_STORAGE_KEY);
  const index = parseDraftIndex(indexRaw);
  return [
    CHAT_DRAFT_INDEX_STORAGE_KEY,
    ...Object.keys(index).map(chatDraftStorageKey),
  ];
}

function parseDraftIndex(value: string | null) {
  if (!value) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {} as Record<string, number>;
  }
}

function parseSnapshot(
  state: SimulationJsonValue,
): MessagesSimulationResetSnapshot {
  if (
    !state ||
    Array.isArray(state) ||
    typeof state !== 'object' ||
    state.version !== 1 ||
    !state.entries ||
    Array.isArray(state.entries) ||
    typeof state.entries !== 'object'
  ) {
    throw new Error('Invalid Messages simulation reset snapshot.');
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.entries)) {
    if (
      typeof value !== 'string' ||
      (key !== CHAT_DRAFT_INDEX_STORAGE_KEY &&
        !key.startsWith(CHAT_DRAFT_STORAGE_PREFIX))
    ) {
      throw new Error('Invalid Messages simulation draft entry.');
    }
    entries[key] = value;
  }
  return { entries, version: 1 };
}
