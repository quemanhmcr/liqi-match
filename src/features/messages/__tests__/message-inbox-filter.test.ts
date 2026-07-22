import { describe, expect, it } from '@jest/globals';

import type { MessageConversationSummary } from '../contracts/messages-contracts';
import { matchesMessageInboxFilter } from '../model/message-inbox-filter';

function conversation(
  kind: MessageConversationSummary['kind'],
  relationship: MessageConversationSummary['relationship'],
  unreadCount = 0,
): MessageConversationSummary {
  return {
    capabilities: {
      canCall: false,
      canMessage: true,
      canMute: true,
      canViewDetails: true,
      composerActions: [],
    },
    id: `${kind}:${relationship}`,
    kind,
    latestActivity: null,
    participants: { preview: [], totalCount: 0 },
    presence: { label: 'Ẩn', state: 'hidden' },
    relationship,
    title: `${kind} ${relationship}`,
    viewerState: {
      isArchived: false,
      isMuted: false,
      isPinned: false,
      unreadCount,
    },
  };
}

describe('message inbox filter authority', () => {
  it('treats every direct relationship as Cá nhân', () => {
    for (const relationship of ['match', 'friend', 'soulmate'] as const) {
      expect(
        matchesMessageInboxFilter(
          conversation('direct', relationship),
          'direct',
        ),
      ).toBe(true);
    }

    expect(
      matchesMessageInboxFilter(conversation('group', 'friend'), 'direct'),
    ).toBe(false);
  });

  it('treats conversation kind, not relationship decoration, as Nhóm authority', () => {
    expect(
      matchesMessageInboxFilter(conversation('group', 'friend'), 'group'),
    ).toBe(true);
    expect(
      matchesMessageInboxFilter(conversation('group', 'team'), 'group'),
    ).toBe(true);
    expect(
      matchesMessageInboxFilter(conversation('direct', 'team'), 'group'),
    ).toBe(false);
  });

  it('keeps unread orthogonal to conversation shape', () => {
    expect(
      matchesMessageInboxFilter(conversation('system', 'system', 2), 'unread'),
    ).toBe(true);
    expect(
      matchesMessageInboxFilter(conversation('direct', 'match'), 'unread'),
    ).toBe(false);
  });
});
