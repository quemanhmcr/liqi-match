import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';

import type { ChatDraftIndex } from './chat-draft-store';
import { normalizeChatDraftPreview } from './chat-draft-store';
import type {
  ChatMediaAttachment,
  OutgoingChatMessage,
  OutgoingMediaMessage,
  OutgoingTextMessage,
} from './chat-message';
import { createClientMessageId } from './client-message-id';

export const EMPTY_RUNTIME_MESSAGES: readonly OutgoingChatMessage[] = [];

const PENDING_MESSAGE_STORAGE_PREFIX = 'liqi:messages:pending:v1';

const PendingAttachmentSchema = z.object({
  altText: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  height: z.number().int().positive().optional(),
  mediaType: z.enum(['image', 'video']),
  mimeType: z.string().optional(),
  thumbnailUri: z.string().optional(),
  uri: z.string().min(1),
  width: z.number().int().positive().optional(),
});

const PendingMessageBaseSchema = z.object({
  canonicalId: z.string().optional(),
  clientMessageId: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  deliveryStatus: z.enum(['queued', 'sending', 'failed']),
  direction: z.literal('outgoing'),
  id: z.string().min(1),
  senderId: z.string().optional(),
  sequence: z.number().int().positive().optional(),
});

const PendingOutgoingMessageSchema = z.discriminatedUnion('kind', [
  PendingMessageBaseSchema.extend({
    kind: z.literal('text'),
    text: z.string(),
  }),
  PendingMessageBaseSchema.extend({
    attachment: PendingAttachmentSchema,
    caption: z.string().optional(),
    kind: z.literal('media'),
    mediaFailureReason: z.enum(['cancelled', 'send-failed']).optional(),
  }),
]);

const PendingMessageIndexSchema = z.object({
  messagesByConversation: z.record(
    z.string(),
    z.array(PendingOutgoingMessageSchema),
  ),
  version: z.literal(1),
});

type PendingMessageIndex = z.infer<typeof PendingMessageIndexSchema>;

let pendingPersistenceScope: string | null = null;
let pendingPersistenceGeneration = 0;
let pendingPersistenceReady = false;
let pendingWriteChain: Promise<void> = Promise.resolve();

export function chatPendingMessageStorageKey(accountId: string) {
  return `${PENDING_MESSAGE_STORAGE_PREFIX}:${accountId}`;
}

function pendingMessagesSnapshot(
  messagesByConversation: Record<string, OutgoingChatMessage[]>,
): PendingMessageIndex {
  const pending: PendingMessageIndex['messagesByConversation'] = {};
  for (const [conversationId, messages] of Object.entries(
    messagesByConversation,
  )) {
    const retained = messages
      .filter((message) =>
        ['queued', 'sending', 'failed'].includes(message.deliveryStatus),
      )
      .map((message) => PendingOutgoingMessageSchema.parse(message));
    if (retained.length > 0) pending[conversationId] = retained;
  }
  return { messagesByConversation: pending, version: 1 };
}

function schedulePendingMessagesPersistence(
  messagesByConversation: Record<string, OutgoingChatMessage[]>,
) {
  const accountId = pendingPersistenceScope;
  if (!accountId || !pendingPersistenceReady) return;
  const snapshot = pendingMessagesSnapshot(messagesByConversation);
  const key = chatPendingMessageStorageKey(accountId);
  pendingWriteChain = pendingWriteChain
    .catch(() => undefined)
    .then(async () => {
      if (Object.keys(snapshot.messagesByConversation).length === 0) {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, JSON.stringify(snapshot));
      }
    });
}

function restorePendingMessageIndex(raw: string | null) {
  if (!raw) return {} as Record<string, OutgoingChatMessage[]>;
  try {
    const parsed = PendingMessageIndexSchema.parse(JSON.parse(raw));
    return Object.fromEntries(
      Object.entries(parsed.messagesByConversation).map(
        ([conversationId, messages]) => [
          conversationId,
          messages.map((message) => ({
            ...message,
            deliveryStatus:
              message.deliveryStatus === 'sending'
                ? ('queued' as const)
                : message.deliveryStatus,
          })) as OutgoingChatMessage[],
        ],
      ),
    );
  } catch {
    return {} as Record<string, OutgoingChatMessage[]>;
  }
}

function mergePendingMessages(
  persisted: Record<string, OutgoingChatMessage[]>,
  current: Record<string, OutgoingChatMessage[]>,
) {
  const merged: Record<string, OutgoingChatMessage[]> = { ...persisted };
  for (const [conversationId, messages] of Object.entries(current)) {
    const byId = new Map(
      (merged[conversationId] ?? []).map((message) => [message.id, message]),
    );
    for (const message of messages) byId.set(message.id, message);
    merged[conversationId] = [...byId.values()];
  }
  return merged;
}

type EnqueueOutgoingTextInput = {
  createdAt: string;
  conversationId: string;
  text: string;
};

type EnqueueOutgoingMediaInput = {
  attachment: ChatMediaAttachment;
  caption?: string;
  createdAt: string;
  conversationId: string;
};

type ChatRuntimeState = {
  clearDraft: (conversationId: string) => void;
  draftHydratedByConversation: Record<string, true | undefined>;
  draftIndexHydrated: boolean;
  draftPreviewsByConversation: Record<string, string | undefined>;
  draftTouchedByConversation: Record<string, true | undefined>;
  draftUpdatedAtByConversation: Record<string, number | undefined>;
  draftsByConversation: Record<string, string | undefined>;
  enqueueOutgoingMedia: (
    input: EnqueueOutgoingMediaInput,
  ) => OutgoingMediaMessage;
  enqueueOutgoingText: (input: EnqueueOutgoingTextInput) => OutgoingTextMessage;
  hydrateDraft: (conversationId: string, draft: string) => void;
  hydrateDraftIndex: (drafts: ChatDraftIndex) => void;
  markConversationRead: (conversationId: string) => void;
  messagesByConversation: Record<string, OutgoingChatMessage[]>;
  nextClientSequence: number;
  patchOutgoingMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<OutgoingChatMessage>,
  ) => void;
  removeOutgoingMessage: (conversationId: string, messageId: string) => void;
  readConversationIds: Record<string, true | undefined>;
  reset: () => void;
  setDraft: (conversationId: string, draft: string) => void;
};

function initialRuntimeState() {
  return {
    draftHydratedByConversation: {} as Record<string, true | undefined>,
    draftIndexHydrated: false,
    draftPreviewsByConversation: {} as Record<string, string | undefined>,
    draftTouchedByConversation: {} as Record<string, true | undefined>,
    draftUpdatedAtByConversation: {} as Record<string, number | undefined>,
    draftsByConversation: {} as Record<string, string | undefined>,
    messagesByConversation: {} as Record<string, OutgoingChatMessage[]>,
    nextClientSequence: 0,
    readConversationIds: {} as Record<string, true | undefined>,
  };
}

function nextMessageIdentity(
  _conversationId: string,
  _sequence: number,
  kind: 'media' | 'text',
) {
  return createClientMessageId(kind);
}

export const useChatRuntimeStore = create<ChatRuntimeState>((set, get) => ({
  ...initialRuntimeState(),
  clearDraft: (conversationId) =>
    set((state) => ({
      draftPreviewsByConversation: {
        ...state.draftPreviewsByConversation,
        [conversationId]: '',
      },
      draftTouchedByConversation: {
        ...state.draftTouchedByConversation,
        [conversationId]: true,
      },
      draftUpdatedAtByConversation: {
        ...state.draftUpdatedAtByConversation,
        [conversationId]: Date.now(),
      },
      draftsByConversation: {
        ...state.draftsByConversation,
        [conversationId]: '',
      },
    })),
  enqueueOutgoingMedia: (input) => {
    const nextClientSequence = get().nextClientSequence + 1;
    const message: OutgoingMediaMessage = {
      attachment: input.attachment,
      caption: input.caption,
      createdAt: input.createdAt,
      deliveryStatus: 'sending',
      direction: 'outgoing',
      transferProgress: 0,
      id: nextMessageIdentity(
        input.conversationId,
        nextClientSequence,
        'media',
      ),
      kind: 'media',
    };
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [input.conversationId]: [
          ...(state.messagesByConversation[input.conversationId] ?? []),
          message,
        ],
      },
      nextClientSequence,
    }));
    return message;
  },
  enqueueOutgoingText: (input) => {
    const nextClientSequence = get().nextClientSequence + 1;
    const message: OutgoingTextMessage = {
      createdAt: input.createdAt,
      deliveryStatus: 'sending',
      direction: 'outgoing',
      id: nextMessageIdentity(input.conversationId, nextClientSequence, 'text'),
      kind: 'text',
      text: input.text,
    };

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [input.conversationId]: [
          ...(state.messagesByConversation[input.conversationId] ?? []),
          message,
        ],
      },
      nextClientSequence,
    }));

    return message;
  },
  hydrateDraft: (conversationId, draft) =>
    set((state) => {
      const wasTouched = state.draftTouchedByConversation[conversationId];
      return {
        draftHydratedByConversation: {
          ...state.draftHydratedByConversation,
          [conversationId]: true,
        },
        draftPreviewsByConversation: wasTouched
          ? state.draftPreviewsByConversation
          : {
              ...state.draftPreviewsByConversation,
              [conversationId]: normalizeChatDraftPreview(draft),
            },
        draftsByConversation: wasTouched
          ? state.draftsByConversation
          : {
              ...state.draftsByConversation,
              [conversationId]: draft,
            },
      };
    }),
  hydrateDraftIndex: (drafts) =>
    set((state) => {
      const previews = { ...state.draftPreviewsByConversation };
      const updatedAt = { ...state.draftUpdatedAtByConversation };
      for (const [conversationId, entry] of Object.entries(drafts)) {
        if (state.draftTouchedByConversation[conversationId]) continue;
        previews[conversationId] = entry.preview;
        updatedAt[conversationId] = entry.updatedAt;
      }
      return {
        draftIndexHydrated: true,
        draftPreviewsByConversation: previews,
        draftUpdatedAtByConversation: updatedAt,
      };
    }),
  markConversationRead: (conversationId) =>
    set((state) => ({
      readConversationIds: {
        ...state.readConversationIds,
        [conversationId]: true,
      },
    })),
  patchOutgoingMessage: (conversationId, messageId, patch) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (
          state.messagesByConversation[conversationId] ?? []
        ).map((message) =>
          message.id === messageId
            ? ({ ...message, ...patch } as OutgoingChatMessage)
            : message,
        ),
      },
    })),
  removeOutgoingMessage: (conversationId, messageId) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (
          state.messagesByConversation[conversationId] ?? []
        ).filter((message) => message.id !== messageId),
      },
    })),
  reset: () => set(initialRuntimeState()),
  setDraft: (conversationId, draft) =>
    set((state) => ({
      draftPreviewsByConversation: {
        ...state.draftPreviewsByConversation,
        [conversationId]: normalizeChatDraftPreview(draft),
      },
      draftTouchedByConversation: {
        ...state.draftTouchedByConversation,
        [conversationId]: true,
      },
      draftUpdatedAtByConversation: {
        ...state.draftUpdatedAtByConversation,
        [conversationId]: Date.now(),
      },
      draftsByConversation: {
        ...state.draftsByConversation,
        [conversationId]: draft,
      },
    })),
}));

useChatRuntimeStore.subscribe((state, previous) => {
  if (state.messagesByConversation !== previous.messagesByConversation) {
    schedulePendingMessagesPersistence(state.messagesByConversation);
  }
});

export async function setChatPendingMessagePersistenceScope(
  accountId: string | null,
) {
  const generation = ++pendingPersistenceGeneration;
  pendingPersistenceScope = accountId;
  pendingPersistenceReady = false;
  useChatRuntimeStore.setState({
    messagesByConversation: {},
    readConversationIds: {},
  });

  if (!accountId) return;
  const raw = await AsyncStorage.getItem(
    chatPendingMessageStorageKey(accountId),
  );
  if (
    generation !== pendingPersistenceGeneration ||
    pendingPersistenceScope !== accountId
  ) {
    return;
  }

  const persisted = restorePendingMessageIndex(raw);
  const current = useChatRuntimeStore.getState().messagesByConversation;
  const merged = mergePendingMessages(persisted, current);
  useChatRuntimeStore.setState({ messagesByConversation: merged });
  pendingPersistenceReady = true;
  schedulePendingMessagesPersistence(merged);
}

export async function flushChatPendingMessagePersistence() {
  await pendingWriteChain;
}

export async function resetChatPendingMessagePersistenceForTests() {
  await pendingWriteChain.catch(() => undefined);
  pendingPersistenceGeneration += 1;
  pendingPersistenceScope = null;
  pendingPersistenceReady = false;
  pendingWriteChain = Promise.resolve();
  useChatRuntimeStore.setState({
    messagesByConversation: {},
    readConversationIds: {},
  });
}

export function enqueueRuntimeOutgoingMedia(input: EnqueueOutgoingMediaInput) {
  return useChatRuntimeStore.getState().enqueueOutgoingMedia(input);
}

export function enqueueRuntimeOutgoingText(input: EnqueueOutgoingTextInput) {
  return useChatRuntimeStore.getState().enqueueOutgoingText(input);
}

export function hydrateRuntimeChatDraft(conversationId: string, draft: string) {
  useChatRuntimeStore.getState().hydrateDraft(conversationId, draft);
}

export function setRuntimeChatDraft(conversationId: string, draft: string) {
  useChatRuntimeStore.getState().setDraft(conversationId, draft);
}

export function resetChatRuntimeStore() {
  useChatRuntimeStore.getState().reset();
}
