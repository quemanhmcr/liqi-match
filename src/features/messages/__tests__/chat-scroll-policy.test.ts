import { describe, expect, it } from '@jest/globals';

import {
  distanceFromChatEnd,
  isAtChatEnd,
  isNearChatEnd,
  resolveChatScrollableEndInset,
  shouldAutoScrollForNewMessage,
  shouldLoadOlderMessages,
} from '@/features/messages/model/chat-scroll-policy';

describe('chat scroll policy', () => {
  it('measures distance from the end without negative overscroll', () => {
    expect(
      distanceFromChatEnd({
        contentHeight: 1_000,
        offsetY: 550,
        viewportHeight: 400,
      }),
    ).toBe(50);
    expect(
      distanceFromChatEnd({
        contentHeight: 500,
        offsetY: 200,
        viewportHeight: 400,
      }),
    ).toBe(0);
  });

  it('includes the keyboard-owned inset for short conversations', () => {
    const endInset = resolveChatScrollableEndInset(334, 34);
    const metrics = {
      contentHeight: 600,
      endInset,
      viewportHeight: 600,
    };

    expect(endInset).toBe(300);
    expect(distanceFromChatEnd({ ...metrics, offsetY: 0 })).toBe(300);
    expect(isNearChatEnd({ ...metrics, offsetY: 0 })).toBe(false);
    expect(isAtChatEnd({ ...metrics, offsetY: 279 })).toBe(false);
    expect(isAtChatEnd({ ...metrics, offsetY: 280 })).toBe(true);
    expect(isAtChatEnd({ ...metrics, offsetY: 300 })).toBe(true);
  });

  it('normalizes invalid keyboard geometry instead of creating ghost range', () => {
    expect(resolveChatScrollableEndInset(Number.NaN, 34)).toBe(0);
    expect(resolveChatScrollableEndInset(20, 34)).toBe(0);
    expect(resolveChatScrollableEndInset(300, -10)).toBe(300);
  });

  it('only auto-scrolls incoming messages when the reader is near the end', () => {
    expect(
      shouldAutoScrollForNewMessage({
        direction: 'incoming',
        isNearEnd: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoScrollForNewMessage({ direction: 'incoming', isNearEnd: true }),
    ).toBe(true);
    expect(
      shouldAutoScrollForNewMessage({
        direction: 'outgoing',
        isNearEnd: false,
      }),
    ).toBe(true);
  });

  it('loads older messages only near the top with an available idle page', () => {
    expect(shouldLoadOlderMessages(20, true, false)).toBe(true);
    expect(shouldLoadOlderMessages(100, true, false)).toBe(false);
    expect(shouldLoadOlderMessages(20, false, false)).toBe(false);
    expect(shouldLoadOlderMessages(20, true, true)).toBe(false);
    expect(
      isNearChatEnd({
        contentHeight: 1_000,
        offsetY: 520,
        viewportHeight: 400,
      }),
    ).toBe(true);
  });
});
