import { describe, expect, it } from '@jest/globals';

import {
  isMessageInboxAttentionStateActionable,
  resolveMessageInboxAttentionState,
} from '../model/message-inbox-attention';

describe('message inbox attention authority', () => {
  it('prioritizes recoverable delivery failures over drafts and unread state', () => {
    expect(
      resolveMessageInboxAttentionState({
        hasDraft: true,
        latestDeliveryStatus: 'failed',
        latestDirection: 'outgoing',
        unreadCount: 4,
      }),
    ).toBe('failed');
    expect(
      resolveMessageInboxAttentionState({
        hasDraft: true,
        latestDeliveryStatus: 'queued',
        latestDirection: 'outgoing',
        unreadCount: 4,
      }),
    ).toBe('queued');
  });

  it('keeps a draft ahead of transient sending and unread state', () => {
    expect(
      resolveMessageInboxAttentionState({
        hasDraft: true,
        latestDeliveryStatus: 'sending',
        latestDirection: 'outgoing',
        unreadCount: 2,
      }),
    ).toBe('draft');
  });

  it('uses sending as a visible but non-actionable transient state', () => {
    const state = resolveMessageInboxAttentionState({
      hasDraft: false,
      latestDeliveryStatus: 'sending',
      latestDirection: 'outgoing',
      unreadCount: 2,
    });

    expect(state).toBe('sending');
    expect(isMessageInboxAttentionStateActionable(state)).toBe(false);
  });

  it('falls back to unread and normal when no stronger state exists', () => {
    expect(
      resolveMessageInboxAttentionState({ hasDraft: false, unreadCount: 2 }),
    ).toBe('unread');
    expect(
      resolveMessageInboxAttentionState({ hasDraft: false, unreadCount: 0 }),
    ).toBe('normal');
  });

  it('ignores impossible delivery decoration on incoming activity', () => {
    expect(
      resolveMessageInboxAttentionState({
        hasDraft: false,
        latestDeliveryStatus: 'failed',
        latestDirection: 'incoming',
        unreadCount: 1,
      }),
    ).toBe('unread');
  });

  it.each(['sending', 'normal'] as const)(
    'keeps %s outside the attention section',
    (state) => {
      expect(isMessageInboxAttentionStateActionable(state)).toBe(false);
    },
  );

  it.each(['failed', 'queued', 'draft', 'unread'] as const)(
    'places %s in the attention section',
    (state) => {
      expect(isMessageInboxAttentionStateActionable(state)).toBe(true);
    },
  );
});
