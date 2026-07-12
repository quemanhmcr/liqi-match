import { describe, expect, it } from '@jest/globals';

import { messagesContractVersion } from '@/features/messages/contracts/messages-contracts';
import { createLocalChatRepository } from '@/features/messages/services/chat-repository';

describe('local chat repository contract', () => {
  it('returns null for an unknown conversation and an empty versioned timeline', async () => {
    const repository = createLocalChatRepository();

    await expect(
      repository.getConversation('missing-thread'),
    ).resolves.toBeNull();
    const timeline = await repository.getMessagePage('missing-thread');

    expect(timeline.contractVersion).toBe(messagesContractVersion);
    expect(timeline.meta.requestId).toMatch(/^messages-preview-/);
    expect(timeline.data).toEqual({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
  });

  it('paginates backward with opaque cursors and no overlap', async () => {
    const repository = createLocalChatRepository({ pageSize: 3 });
    const all = await repository.getMessagePage('minh-anh', { limit: 100 });
    const latest = await repository.getMessagePage('minh-anh');

    expect(latest.data.items).toEqual(all.data.items.slice(-3));
    expect(latest.data.pageInfo.nextCursor).toMatch(
      /^timeline:v1:minh-anh:\d+$/,
    );

    const older = await repository.getMessagePage('minh-anh', {
      cursor: latest.data.pageInfo.nextCursor ?? undefined,
    });
    const combined = [...older.data.items, ...latest.data.items];

    expect(new Set(combined.map((message) => message.id)).size).toBe(
      combined.length,
    );
    expect(combined).toEqual(all.data.items.slice(-6));
  });

  it('filters and searches the inbox through the contract instead of the screen', async () => {
    const repository = createLocalChatRepository();
    const teams = await repository.listConversations({ filter: 'teams' });
    const search = await repository.listConversations({ query: 'Khoa' });

    expect(teams.data.items.map(({ relationship }) => relationship)).toEqual([
      'team',
    ]);
    expect(search.data.items.map(({ id }) => id)).toEqual(['khoa-jungle']);
    expect(teams.data.pageInfo.nextCursor).toBeNull();
  });

  it('rejects a stale cursor with a typed retryable error', async () => {
    const repository = createLocalChatRepository();

    await expect(
      repository.listConversations({ cursor: 'page=2' }),
    ).rejects.toMatchObject({ code: 'stale_cursor', retryable: true });
  });
});
