export type ChatKeyboardGeometry = {
  bottomInset: number;
  scrollOffset: number;
  stickyOffset: {
    closed: number;
    opened: number;
  };
};

function normalizeInset(value: number) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

/**
 * The keyboard controller reports an edge-to-edge IME height measured from the
 * physical bottom of the window. The composer already contains the bottom safe
 * area, so both the sticky translation and the chat-scroll keyboard padding
 * subtract that inset exactly once.
 */
export function resolveChatKeyboardGeometry(
  bottomInset: number,
): ChatKeyboardGeometry {
  const safeBottom = normalizeInset(bottomInset);

  return {
    bottomInset: safeBottom,
    scrollOffset: safeBottom,
    stickyOffset: {
      closed: 0,
      opened: safeBottom,
    },
  };
}
