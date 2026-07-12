import { describe, expect, it } from '@jest/globals';

import {
  acknowledgeChatFollowTarget,
  completeChatFollowAtEnd,
  markChatFollowFlushed,
  requestChatFollow,
  shouldFlushChatFollow,
} from '@/features/messages/model/chat-follow-intent';

describe('chat follow intent', () => {
  it('waits for the exact target bubble layout before scrolling', () => {
    const requested = requestChatFollow(undefined, {
      conversationId: 'khoa-jungle',
      messageId: 'local-khoa-jungle-text-1',
    });

    expect(shouldFlushChatFollow(requested, 'khoa-jungle')).toBe(false);
    expect(
      acknowledgeChatFollowTarget(requested, 'khoa-jungle', 'another-message'),
    ).toEqual(requested);

    const acknowledged = acknowledgeChatFollowTarget(
      requested,
      'khoa-jungle',
      'local-khoa-jungle-text-1',
    );
    expect(shouldFlushChatFollow(acknowledged, 'khoa-jungle')).toBe(true);
  });

  it('preserves target acknowledgement when React observes the same message twice', () => {
    const acknowledged = acknowledgeChatFollowTarget(
      requestChatFollow(undefined, {
        conversationId: 'aya-only',
        messageId: 'local-aya-only-text-1',
      }),
      'aya-only',
      'local-aya-only-text-1',
    );

    expect(
      requestChatFollow(acknowledged, {
        conversationId: 'aya-only',
        messageId: 'local-aya-only-text-1',
      }),
    ).toEqual(acknowledged);
  });

  it('keeps correcting without animation until the keyboard-adjusted end is reached', () => {
    const acknowledged = requestChatFollow(undefined, {
      conversationId: 'team-sao-bang',
      messageId: 'local-team-sao-bang-text-1',
      targetLayoutAcknowledged: true,
    });
    const flushed = markChatFollowFlushed(acknowledged, 'team-sao-bang');

    expect(flushed?.animated).toBe(false);
    expect(completeChatFollowAtEnd(flushed, 'team-sao-bang', false)).toEqual(
      flushed,
    );
    expect(
      completeChatFollowAtEnd(flushed, 'team-sao-bang', true),
    ).toBeUndefined();
  });

  it('never consumes an intent from another conversation', () => {
    const intent = requestChatFollow(undefined, {
      conversationId: 'cozy-helen',
      messageId: 'local-cozy-helen-text-1',
      targetLayoutAcknowledged: true,
    });

    expect(shouldFlushChatFollow(intent, 'minh-anh')).toBe(false);
    expect(completeChatFollowAtEnd(intent, 'minh-anh', true)).toEqual(intent);
  });
});
