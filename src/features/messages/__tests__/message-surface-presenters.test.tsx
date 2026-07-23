import { describe, expect, it } from '@jest/globals';

import { createGoldenWorldAssetResolver } from '@/entities/media-asset';

import {
  MessageConversationDetailSchema,
  MessageConversationSummarySchema,
  MessageTimelineItemSchema,
} from '@/features/messages/contracts/messages-contracts';
import {
  presentConversationThread,
  presentInboxConversation,
  presentTimelineMessage,
} from '@/features/messages/model/message-surface-presenters';

const assetResolver = createGoldenWorldAssetResolver();

describe('message surface presenters', () => {
  it('carries team invite artwork from the repository contract into the render model', () => {
    const invite = MessageTimelineItemSchema.parse({
      artwork: {
        assetKey: 'asset:set:sao-bang:artwork',
        kind: 'fixture',
      },
      createdAt: '2026-07-12T10:05:00.000Z',
      direction: 'incoming',
      id: 'invite-1',
      kind: 'team_invite',
      members: ['Yue', 'Lorian'],
      missingRole: 'Mid',
      mode: 'Team Rank',
      teamName: 'Team Sao Băng',
      teamSize: '4/5',
      text: 'Mời bạn vào lobby',
    });

    const rendered = presentTimelineMessage(invite, assetResolver);

    expect(rendered).toMatchObject({
      artwork: {
        kind: 'asset',
        resolved: {
          key: 'asset:set:sao-bang:artwork',
          state: 'ready',
        },
      },
      id: 'invite-1',
      kind: 'team-invite',
      teamName: 'Team Sao Băng',
    });
  });

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
      participants: {
        preview: [
          {
            avatar: {
              id: 'participant-avatar-1',
              kind: 'remote',
              url: 'https://example.com/participant-1.jpg',
            },
            displayName: 'Participant One',
            id: 'participant-1',
            role: 'member',
          },
        ],
        totalCount: 3,
      },
      presence: { label: '2 người online', state: 'online' },
      relationship: 'team',
      source: {
        id: '41000000-0000-4000-8000-000000000003',
        type: 'play_session',
      },
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
    expect(thread.participantCount).toBe(3);
    expect(thread.participantAvatars).toEqual([
      expect.objectContaining({
        kind: 'remote',
        uri: 'https://example.com/participant-1.jpg',
      }),
    ]);
    expect(
      presentInboxConversation({
        assetResolver,
        conversation,
        isRead: false,
        referenceDate: new Date('2026-07-12T12:00:00.000Z'),
        runtimeMessages: [],
      }),
    ).toMatchObject({
      artworkVariant: 'party',
      kind: 'group',
      participantCount: 3,
      sourceType: 'play_session',
    });
    expect(thread.messages.at(-1)).toEqual({
      direction: 'incoming',
      id: 'typing:group-1',
      kind: 'typing',
    });
  });

  it('assigns stable, distributed artwork variants to direct matches', () => {
    const matchIds = [
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000003',
    ] as const;

    const conversations = matchIds.map((matchId, index) =>
      MessageConversationSummarySchema.parse({
        capabilities: {
          canCall: false,
          canMessage: true,
          canMute: false,
          canViewDetails: true,
          composerActions: [],
        },
        id: `direct-match-${index + 1}`,
        kind: 'direct',
        latestActivity: null,
        participants: {
          preview: [
            {
              displayName: `Player ${index + 1}`,
              id: `participant-${index + 1}`,
              role: 'member',
            },
          ],
          totalCount: 2,
        },
        presence: { label: 'Đã ghép đôi', state: 'hidden' },
        relationship: 'match',
        source: { id: matchId, type: 'direct_match' },
        title: `Player ${index + 1}`,
        viewerState: {
          isArchived: false,
          isMuted: false,
          isPinned: false,
          unreadCount: 0,
        },
      }),
    );

    const present = (conversation: (typeof conversations)[number]) =>
      presentInboxConversation({
        assetResolver,
        conversation,
        isRead: false,
        referenceDate: new Date('2026-07-12T12:00:00.000Z'),
        runtimeMessages: [],
      }).artworkVariant;

    const firstPass = conversations.map(present);
    const secondPass = conversations.map(present);

    expect(secondPass).toEqual(firstPass);
    expect(new Set(firstPass).size).toBe(3);
    expect(firstPass.every(Boolean)).toBe(true);
  });

  it('projects one primary attention state and keeps the matching preview authoritative', () => {
    const conversation = MessageConversationSummarySchema.parse({
      capabilities: {
        canCall: false,
        canMessage: true,
        canMute: true,
        canViewDetails: true,
        composerActions: [],
      },
      id: 'attention-conversation',
      kind: 'direct',
      latestActivity: {
        createdAt: '2026-07-12T10:00:00.000Z',
        direction: 'incoming',
        id: 'incoming-unread',
        kind: 'text',
        preview: 'Tin chưa đọc',
      },
      participants: { preview: [], totalCount: 2 },
      presence: { label: 'Ngoại tuyến', state: 'offline' },
      relationship: 'friend',
      title: 'Người cần phản hồi',
      viewerState: {
        isArchived: false,
        isMuted: false,
        isPinned: false,
        unreadCount: 3,
      },
    });

    const presented = presentInboxConversation({
      assetResolver,
      conversation,
      draftPreview: 'Bản nháp mới hơn',
      draftUpdatedAt: new Date('2026-07-12T10:03:00.000Z').getTime(),
      isRead: false,
      referenceDate: new Date('2026-07-12T12:00:00.000Z'),
      runtimeMessages: [
        {
          createdAt: '2026-07-12T10:02:00.000Z',
          deliveryStatus: 'failed',
          direction: 'outgoing',
          id: 'failed-outgoing',
          kind: 'text',
          text: 'Không gửi được',
        },
      ],
    });

    expect(presented).toMatchObject({
      attentionState: 'failed',
      isDraft: false,
      lastMessage: 'Không gửi được',
      latestDeliveryStatus: 'failed',
      latestDirection: 'outgoing',
      previewPrefix: 'Bạn:',
      unreadCount: 3,
    });
  });
});
