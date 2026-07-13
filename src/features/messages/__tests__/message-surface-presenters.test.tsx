import { describe, expect, it } from '@jest/globals';

import { createGoldenWorldAssetResolver } from '@/entities/media-asset';

import {
  MessageConversationDetailSchema,
  MessageTimelineItemSchema,
} from '@/features/messages/contracts/messages-contracts';
import {
  presentConversationThread,
  presentTimelineMessage,
} from '@/features/messages/model/message-surface-presenters';

const assetResolver = createGoldenWorldAssetResolver();

describe('message surface presenters', () => {
  it('presents received media and typing as stable render-model items', () => {
    const media = MessageTimelineItemSchema.parse({
      caption: 'Build mới',
      createdAt: '2026-07-12T10:00:00.000Z',
      direction: 'incoming',
      height: 900,
      id: 'media-1',
      kind: 'media',
      mediaType: 'image',
      source: {
        id: 'asset-1',
        kind: 'remote',
        url: 'https://example.com/build.jpg',
      },
      width: 1200,
    });
    const rendered = presentTimelineMessage(media, assetResolver);

    expect(rendered).toMatchObject({
      attachment: {
        height: 900,
        mediaType: 'image',
        uri: 'https://example.com/build.jpg',
        width: 1200,
      },
      direction: 'incoming',
      id: 'media-1',
      kind: 'media',
    });

    const conversation = MessageConversationDetailSchema.parse({
      capabilities: {
        canCall: false,
        canMessage: true,
        canMute: true,
        canViewDetails: true,
        composerActions: [],
      },
      composer: { placeholder: 'Nhắn cho nhóm...' },
      id: 'group-1',
      kind: 'group',
      latestActivity: null,
      liveState: { typingParticipantIds: ['participant-1'] },
      members: [],
      participants: { preview: [], totalCount: 3 },
      presence: { label: '2 người online', state: 'online' },
      relationship: 'team',
      subtitle: '2 người online',
      title: 'Team Test',
      viewerState: {
        isArchived: false,
        isMuted: false,
        isPinned: true,
        unreadCount: 0,
      },
    });
    const thread = presentConversationThread(
      conversation,
      [media],
      assetResolver,
    );

    expect(thread.kind).toBe('Team');
    expect(thread.messages.at(-1)).toEqual({
      direction: 'incoming',
      id: 'typing:group-1',
      kind: 'typing',
    });
  });
});
