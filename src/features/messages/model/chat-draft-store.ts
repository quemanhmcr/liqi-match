import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHAT_DRAFT_STORAGE_PREFIX = '@liqi-match/chat-draft-v1:';
export const CHAT_DRAFT_INDEX_STORAGE_KEY = '@liqi-match/chat-draft-index-v2';
export const CHAT_DRAFT_SAVE_DEBOUNCE_MS = 350;
const CHAT_DRAFT_PREVIEW_LIMIT = 160;

export type ChatDraftIndexEntry = {
  hasAttachments: boolean;
  preview: string;
  updatedAt: number;
};

export type ChatDraftIndex = Record<string, ChatDraftIndexEntry>;

type PendingDraftSave = {
  draft: string;
  timer: ReturnType<typeof setTimeout>;
  updatedAt: number;
};

const draftWriteQueues = new Map<string, Promise<void>>();
const pendingDraftSaves = new Map<string, PendingDraftSave>();
let draftIndexWriteQueue: Promise<void> = Promise.resolve();
let draftIndexCache: ChatDraftIndex | undefined;

export function chatDraftStorageKey(conversationId: string) {
  return `${CHAT_DRAFT_STORAGE_PREFIX}${conversationId}`;
}

export function normalizeChatDraftPreview(draft: string) {
  return draft.trim().replace(/\s+/g, ' ').slice(0, CHAT_DRAFT_PREVIEW_LIMIT);
}

function isDraftIndexEntry(value: unknown): value is ChatDraftIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ChatDraftIndexEntry>;
  return (
    typeof entry.hasAttachments === 'boolean' &&
    typeof entry.preview === 'string' &&
    typeof entry.updatedAt === 'number' &&
    Number.isFinite(entry.updatedAt)
  );
}

function parseDraftIndex(raw: string | null): ChatDraftIndex {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, entry]) => isDraftIndexEntry(entry)),
    );
  } catch {
    return {};
  }
}

async function readDraftIndex() {
  if (draftIndexCache) return draftIndexCache;
  draftIndexCache = parseDraftIndex(
    await AsyncStorage.getItem(CHAT_DRAFT_INDEX_STORAGE_KEY),
  );
  return draftIndexCache;
}

function enqueueDraftIndexMutation(
  mutate: (current: ChatDraftIndex) => ChatDraftIndex,
) {
  const operation = draftIndexWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const next = mutate({ ...(await readDraftIndex()) });
      draftIndexCache = next;
      if (Object.keys(next).length === 0) {
        await AsyncStorage.removeItem(CHAT_DRAFT_INDEX_STORAGE_KEY);
        return;
      }
      await AsyncStorage.setItem(
        CHAT_DRAFT_INDEX_STORAGE_KEY,
        JSON.stringify(next),
      );
    });
  draftIndexWriteQueue = operation;
  return operation;
}

function enqueueDraftWrite(
  conversationId: string,
  operation: () => Promise<void>,
) {
  const previous = draftWriteQueues.get(conversationId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  draftWriteQueues.set(conversationId, current);

  return current.finally(() => {
    if (draftWriteQueues.get(conversationId) === current) {
      draftWriteQueues.delete(conversationId);
    }
  });
}

export async function loadChatDraftIndex() {
  await draftIndexWriteQueue.catch(() => undefined);
  return { ...(await readDraftIndex()) };
}

export async function loadChatDraft(conversationId: string) {
  await flushChatDraft(conversationId).catch(() => undefined);
  await draftWriteQueues.get(conversationId)?.catch(() => undefined);
  return (
    (await AsyncStorage.getItem(chatDraftStorageKey(conversationId))) ?? ''
  );
}

export function saveChatDraft(
  conversationId: string,
  draft: string,
  updatedAt = Date.now(),
) {
  return enqueueDraftWrite(conversationId, async () => {
    const key = chatDraftStorageKey(conversationId);
    const preview = normalizeChatDraftPreview(draft);

    if (!preview) {
      await AsyncStorage.removeItem(key);
      await enqueueDraftIndexMutation((current) => {
        delete current[conversationId];
        return current;
      });
      return;
    }

    await AsyncStorage.setItem(key, draft);
    await enqueueDraftIndexMutation((current) => ({
      ...current,
      [conversationId]: {
        hasAttachments: false,
        preview,
        updatedAt,
      },
    }));
  });
}

export function scheduleChatDraftSave(
  conversationId: string,
  draft: string,
  delayMs = CHAT_DRAFT_SAVE_DEBOUNCE_MS,
) {
  const existing = pendingDraftSaves.get(conversationId);
  if (existing) clearTimeout(existing.timer);

  const updatedAt = Date.now();
  const timer = setTimeout(
    () => {
      const pending = pendingDraftSaves.get(conversationId);
      if (!pending || pending.timer !== timer) return;
      pendingDraftSaves.delete(conversationId);
      void saveChatDraft(
        conversationId,
        pending.draft,
        pending.updatedAt,
      ).catch(() => undefined);
    },
    Math.max(0, delayMs),
  );

  pendingDraftSaves.set(conversationId, { draft, timer, updatedAt });
}

export function flushChatDraft(conversationId: string) {
  const pending = pendingDraftSaves.get(conversationId);
  if (!pending) {
    return draftWriteQueues.get(conversationId) ?? Promise.resolve();
  }

  clearTimeout(pending.timer);
  pendingDraftSaves.delete(conversationId);
  return saveChatDraft(conversationId, pending.draft, pending.updatedAt);
}

export async function flushAllChatDrafts() {
  await Promise.all(
    [...pendingDraftSaves.keys()].map((conversationId) =>
      flushChatDraft(conversationId),
    ),
  );
  await Promise.all([...draftWriteQueues.values()]);
  await draftIndexWriteQueue;
}

export function clearChatDraft(conversationId: string) {
  const pending = pendingDraftSaves.get(conversationId);
  if (pending) clearTimeout(pending.timer);
  pendingDraftSaves.delete(conversationId);

  return enqueueDraftWrite(conversationId, async () => {
    await AsyncStorage.removeItem(chatDraftStorageKey(conversationId));
    await enqueueDraftIndexMutation((current) => {
      delete current[conversationId];
      return current;
    });
  });
}

export function resetChatDraftPersistenceState() {
  for (const { timer } of pendingDraftSaves.values()) clearTimeout(timer);
  pendingDraftSaves.clear();
  draftWriteQueues.clear();
  draftIndexWriteQueue = Promise.resolve();
  draftIndexCache = undefined;
}

export const resetChatDraftPersistenceForTests = resetChatDraftPersistenceState;
