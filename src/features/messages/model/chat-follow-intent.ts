export type ChatFollowIntent = {
  animated: boolean;
  conversationId: string;
  messageId: string;
  targetLayoutAcknowledged: boolean;
};

export type RequestChatFollowInput = {
  animated?: boolean;
  conversationId: string;
  messageId: string;
  targetLayoutAcknowledged?: boolean;
};

export function requestChatFollow(
  current: ChatFollowIntent | undefined,
  {
    animated = true,
    conversationId,
    messageId,
    targetLayoutAcknowledged = false,
  }: RequestChatFollowInput,
): ChatFollowIntent {
  if (
    current?.conversationId === conversationId &&
    current.messageId === messageId
  ) {
    return {
      ...current,
      targetLayoutAcknowledged:
        current.targetLayoutAcknowledged || targetLayoutAcknowledged,
    };
  }

  return {
    animated,
    conversationId,
    messageId,
    targetLayoutAcknowledged,
  };
}

export function acknowledgeChatFollowTarget(
  current: ChatFollowIntent | undefined,
  conversationId: string,
  messageId: string,
) {
  if (
    !current ||
    current.conversationId !== conversationId ||
    current.messageId !== messageId
  ) {
    return current;
  }

  return { ...current, targetLayoutAcknowledged: true };
}

export function shouldFlushChatFollow(
  current: ChatFollowIntent | undefined,
  conversationId: string,
) {
  return Boolean(
    current?.conversationId === conversationId &&
    current.targetLayoutAcknowledged,
  );
}

export function markChatFollowFlushed(
  current: ChatFollowIntent | undefined,
  conversationId: string,
) {
  if (!shouldFlushChatFollow(current, conversationId) || !current) {
    return current;
  }

  return { ...current, animated: false };
}

export function completeChatFollowAtEnd(
  current: ChatFollowIntent | undefined,
  conversationId: string,
  isAtEnd: boolean,
) {
  if (!isAtEnd || !shouldFlushChatFollow(current, conversationId) || !current) {
    return current;
  }

  return undefined;
}
