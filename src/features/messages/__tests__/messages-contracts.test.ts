import { describe, expect, it } from '@jest/globals';

import {
  MessageConversationDetailSchema,
  MessageInboxParamsSchema,
  MessageTimelineItemSchema,
} from '@/features/messages/contracts/messages-contracts';

describe('messages surface contracts', () => {
  it('canonicalizes inbox parameters at the transport boundary', () => {
    expect(MessageInboxParamsSchema.parse({})).toEqual({
      filter: 'all',
      limit: 30,
      query: '',
    });
    expect(
      MessageInboxParamsSchema.parse({
        filter: 'unread',
        limit: 50,
        query: 'Minh Anh',
      }),
    ).toEqual({ filter: 'unread', limit: 50, query: 'Minh Anh' });
  });

  it('rejects non-serializable media and invalid capability values', () => {
    expect(() =>
      MessageTimelineItemSchema.parse({
        createdAt: '2026-07-12T10:00:00.000Z',
        direction: 'incoming',
        id: 'media-1',
        kind: 'media',
        mediaType: 'image',
        source: { kind: 'remote', url: 'not-a-url' },
      }),
    ).toThrow();
    expect(() =>
      MessageConversationDetailSchema.parse({
        capabilities: { canMessage: 'yes' },
        id: 'invalid',
      }),
    ).toThrow();
  });
});
