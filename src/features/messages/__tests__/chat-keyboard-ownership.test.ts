import { describe, expect, it } from '@jest/globals';

import { resolveChatKeyboardGeometry } from '../model/chat-keyboard-ownership';

describe('chat keyboard ownership', () => {
  it('subtracts bottom safe area once from both native owners', () => {
    expect(resolveChatKeyboardGeometry(34)).toEqual({
      bottomInset: 34,
      scrollOffset: 34,
      stickyOffset: { closed: 0, opened: 34 },
    });
  });

  it('normalizes invalid safe-area input instead of retaining stale space', () => {
    expect(resolveChatKeyboardGeometry(Number.NaN)).toEqual({
      bottomInset: 0,
      scrollOffset: 0,
      stickyOffset: { closed: 0, opened: 0 },
    });
    expect(resolveChatKeyboardGeometry(-12)).toEqual({
      bottomInset: 0,
      scrollOffset: 0,
      stickyOffset: { closed: 0, opened: 0 },
    });
  });
});
