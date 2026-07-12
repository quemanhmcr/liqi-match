import type { ChatMediaAttachment } from '../model/chat-message';

export const MAX_CHAT_TEXT_LENGTH = 4000;

export type SendChatTextCommand = {
  clientCreatedAt: string;
  clientMessageId: string;
  conversationId: string;
  text: string;
};

export type SendChatMediaCommand = {
  caption?: string;
  clientCreatedAt: string;
  clientMessageId: string;
  conversationId: string;
  media: ChatMediaAttachment;
};

export type SendChatMessageReceipt = {
  acceptedAt?: string;
  canonicalMessageId?: string;
  clientMessageId: string;
};

export type SendChatTextReceipt = SendChatMessageReceipt;
export type SendChatMediaReceipt = SendChatMessageReceipt;

export type ChatTransportFailureCode =
  'offline' | 'rejected' | 'rate-limited' | 'unauthorized' | 'unknown';

export type ChatNetworkState = 'offline' | 'online';

export class ChatTransportError extends Error {
  constructor(
    message: string,
    readonly code: ChatTransportFailureCode,
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'ChatTransportError';
  }
}

export type ChatMessageTransport = {
  getNetworkState?: () => ChatNetworkState;
  sendMedia?: (command: SendChatMediaCommand) => Promise<SendChatMediaReceipt>;
  sendText: (command: SendChatTextCommand) => Promise<SendChatTextReceipt>;
  subscribeNetworkState?: (listener: (state: ChatNetworkState) => void) => {
    remove: () => void;
  };
};

export type ChatScenario = {
  failNextMedia?: ChatTransportFailureCode;
  failNextText?: ChatTransportFailureCode;
  network?: ChatNetworkState;
  sendLatencyMs?: number;
};

export type ChatScenarioController = {
  failNextMedia: (code?: ChatTransportFailureCode) => void;
  failNextText: (code?: ChatTransportFailureCode) => void;
  setNetworkState: (state: ChatNetworkState) => void;
  transport: ChatMessageTransport;
};

export function normalizeChatText(text: string) {
  return text.replace(/\r\n?/g, '\n').trim();
}

export function createSendChatTextCommand(input: SendChatTextCommand) {
  const text = normalizeChatText(input.text);
  if (!text) {
    throw new ChatTransportError(
      'Tin nhắn không được để trống.',
      'rejected',
      false,
    );
  }
  if (text.length > MAX_CHAT_TEXT_LENGTH) {
    throw new ChatTransportError(
      `Tin nhắn không được vượt quá ${MAX_CHAT_TEXT_LENGTH} ký tự.`,
      'rejected',
      false,
    );
  }

  return { ...input, text };
}

export function createSendChatMediaCommand(input: SendChatMediaCommand) {
  if (!input.media.uri.trim()) {
    throw new ChatTransportError('Media không hợp lệ.', 'rejected', false);
  }
  const caption = input.caption ? normalizeChatText(input.caption) : undefined;
  if (caption && caption.length > MAX_CHAT_TEXT_LENGTH) {
    throw new ChatTransportError(
      `Chú thích không được vượt quá ${MAX_CHAT_TEXT_LENGTH} ký tự.`,
      'rejected',
      false,
    );
  }
  return { ...input, caption: caption || undefined };
}

function transportFailure(code: ChatTransportFailureCode) {
  const messages: Record<ChatTransportFailureCode, string> = {
    offline: 'Thiết bị đang ngoại tuyến.',
    rejected: 'Tin nhắn bị từ chối.',
    'rate-limited': 'Bạn đang gửi quá nhanh.',
    unauthorized: 'Phiên đăng nhập không hợp lệ.',
    unknown: 'Không thể gửi tin nhắn.',
  };
  return new ChatTransportError(
    messages[code],
    code,
    code !== 'rejected' && code !== 'unauthorized',
  );
}

function waitForLatency(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

export function createChatScenarioController(
  initial: ChatScenario = {},
): ChatScenarioController {
  let network = initial.network ?? 'online';
  let failNextMedia = initial.failNextMedia;
  let failNextText = initial.failNextText;
  const sendLatencyMs = Math.max(0, initial.sendLatencyMs ?? 0);
  const listeners = new Set<(state: ChatNetworkState) => void>();

  const assertOnline = () => {
    if (network === 'offline') throw transportFailure('offline');
  };

  const createReceipt = (
    command: SendChatTextCommand | SendChatMediaCommand,
  ): SendChatMessageReceipt => ({
    acceptedAt: command.clientCreatedAt,
    canonicalMessageId: command.clientMessageId,
    clientMessageId: command.clientMessageId,
  });

  const transport: ChatMessageTransport = {
    getNetworkState: () => network,
    async sendMedia(command) {
      assertOnline();
      await waitForLatency(sendLatencyMs);
      assertOnline();
      if (failNextMedia) {
        const code = failNextMedia;
        failNextMedia = undefined;
        throw transportFailure(code);
      }
      return createReceipt(command);
    },
    async sendText(command) {
      assertOnline();
      await waitForLatency(sendLatencyMs);
      assertOnline();
      if (failNextText) {
        const code = failNextText;
        failNextText = undefined;
        throw transportFailure(code);
      }
      return createReceipt(command);
    },
    subscribeNetworkState(listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };

  return {
    failNextMedia(code = 'unknown') {
      failNextMedia = code;
    },
    failNextText(code = 'unknown') {
      failNextText = code;
    },
    setNetworkState(state) {
      if (state === network) return;
      network = state;
      for (const listener of listeners) listener(state);
    },
    transport,
  };
}

/**
 * Preview-only adapter used until a product transport is provided by the app
 * composition layer. It performs no network, auth or database IO and is fully
 * deterministic for tests and local product review.
 */
export const previewChatMessageTransport =
  createChatScenarioController().transport;
