import { describe, expect, it } from '@jest/globals';

import { messagesUi, resolveMessageInboxCardVisual } from '../ui/messages-ui';

describe('message inbox card visual hierarchy', () => {
  it('quiets normal rows and gives unread one restrained purple emphasis', () => {
    const normal = resolveMessageInboxCardVisual('normal');
    const unread = resolveMessageInboxCardVisual('unread');

    expect(normal).toMatchObject({
      borderColor: messagesUi.colors.listCardReadStroke,
      emphasis: 'none',
      withShadow: false,
    });
    expect(normal.frameGradient).toEqual([
      messagesUi.colors.listCardReadStroke,
      messagesUi.colors.listCardReadStroke,
    ]);
    expect(unread).toMatchObject({
      borderColor: messagesUi.colors.listCardUnreadStroke,
      emphasis: 'low',
      withShadow: false,
    });
  });

  it('lets failed and queued recovery states replace decorative purple chrome', () => {
    expect(resolveMessageInboxCardVisual('failed')).toMatchObject({
      borderColor: messagesUi.colors.listCardFailureStroke,
      emphasis: 'none',
      withShadow: false,
    });
    expect(resolveMessageInboxCardVisual('queued')).toMatchObject({
      borderColor: messagesUi.colors.listCardQueuedStroke,
      emphasis: 'none',
      withShadow: false,
    });
  });

  it('keeps draft visible but quieter than queued recovery', () => {
    const draft = resolveMessageInboxCardVisual('draft');
    const queued = resolveMessageInboxCardVisual('queued');

    expect(draft).toMatchObject({
      borderColor: messagesUi.colors.listCardDraftStroke,
      emphasis: 'none',
      withShadow: false,
    });
    expect(draft.borderColor).not.toBe(queued.borderColor);
  });

  it('keeps transient sending on the quiet read-row treatment', () => {
    expect(resolveMessageInboxCardVisual('sending')).toEqual(
      resolveMessageInboxCardVisual('normal'),
    );
  });
});
