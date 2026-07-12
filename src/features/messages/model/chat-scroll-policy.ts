export const CHAT_NEAR_END_THRESHOLD_PX = 96;
export const CHAT_AT_END_THRESHOLD_PX = 20;
export const CHAT_LOAD_OLDER_THRESHOLD_PX = 48;

export type ChatScrollMetrics = {
  contentHeight: number;
  endInset?: number;
  offsetY: number;
  viewportHeight: number;
};

function normalizeLength(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(value ?? 0, 0) : 0;
}

export function resolveChatScrollableEndInset(
  keyboardHeight: number,
  keyboardOffset: number,
) {
  return Math.max(
    normalizeLength(keyboardHeight) - normalizeLength(keyboardOffset),
    0,
  );
}

export function distanceFromChatEnd({
  contentHeight,
  endInset = 0,
  offsetY,
  viewportHeight,
}: ChatScrollMetrics) {
  return Math.max(
    normalizeLength(contentHeight) -
      normalizeLength(viewportHeight) +
      normalizeLength(endInset) -
      normalizeLength(offsetY),
    0,
  );
}

export function isNearChatEnd(
  metrics: ChatScrollMetrics,
  threshold = CHAT_NEAR_END_THRESHOLD_PX,
) {
  return distanceFromChatEnd(metrics) <= threshold;
}

export function isAtChatEnd(
  metrics: ChatScrollMetrics,
  threshold = CHAT_AT_END_THRESHOLD_PX,
) {
  return distanceFromChatEnd(metrics) <= threshold;
}

export function shouldLoadOlderMessages(
  offsetY: number,
  hasNextPage: boolean,
  isLoading: boolean,
) {
  return hasNextPage && !isLoading && offsetY <= CHAT_LOAD_OLDER_THRESHOLD_PX;
}

export function shouldAutoScrollForNewMessage({
  direction,
  isNearEnd,
}: {
  direction: 'incoming' | 'outgoing';
  isNearEnd: boolean;
}) {
  return direction === 'outgoing' || isNearEnd;
}
