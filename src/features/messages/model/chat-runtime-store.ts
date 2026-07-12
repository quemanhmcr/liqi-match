import { create } from 'zustand';

import type { ChatDraftIndex } from './chat-draft-store';
import { normalizeChatDraftPreview } from './chat-draft-store';
import type {
  ChatMediaAttachment,
  OutgoingChatMessage,
  OutgoingMediaMessage,
  OutgoingTextMessage,
} from './chat-message';

export const EMPTY_RUNTIME_MESSAGES: readonly OutgoingChatMessage[] = [];

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
  conversationId: string,
  sequence: number,
  kind: 'media' | 'text',
) {
  return `local-${conversationId}-${kind}-${sequence}`;
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
