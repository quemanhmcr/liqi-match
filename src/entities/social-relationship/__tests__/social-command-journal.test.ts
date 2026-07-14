import { describe, expect, it, jest } from '@jest/globals';

import { SocialCommandJournal } from '../social-command-journal';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => void values.delete(key)),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

const accountId = '01000000-0000-4000-8000-000000000001';
const targetPlayerId = '20000000-0000-4000-8000-000000000002';
const firstUuid = '43000000-0000-4000-8000-000000000001';
const secondUuid = '43000000-0000-4000-8000-000000000002';

function createJournal() {
  const storage = createStorage();
  const createUuid = jest
    .fn<() => string>()
    .mockReturnValueOnce(firstUuid)
    .mockReturnValueOnce(secondUuid);
  return {
    createUuid,
    journal: new SocialCommandJournal({
      clientPlatform: 'android',
      clientVersion: '2.0.0-test',
      createUuid,
      now: () => new Date('2026-07-14T15:00:00.000Z'),
      storage,
    }),
    storage,
  };
}

describe('SocialCommandJournal', () => {
  it('reuses the exact command metadata across retry', async () => {
    const { createUuid, journal, storage } = createJournal();
    const input = {
      accountId,
      expectedRelationshipVersion: 3,
      targetPlayerId,
    };

    const first = await journal.requestFriendship(input);
    const retry = await journal.requestFriendship(input);

    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      audit: {
        clientCreatedAt: '2026-07-14T15:00:00.000Z',
        clientPlatform: 'android',
        clientVersion: '2.0.0-test',
        requestId: `social:request-friendship:${firstUuid}`,
      },
      correlationId: firstUuid,
      idempotencyKey: `social:request-friendship:${firstUuid}`,
    });
    expect(createUuid).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('creates a new command when aggregate input changes', async () => {
    const { journal } = createJournal();
    const first = await journal.blockPlayer({
      accountId,
      expectedRelationshipVersion: 3,
      reasonCode: 'user_safety',
      targetPlayerId,
    });
    const changed = await journal.blockPlayer({
      accountId,
      expectedRelationshipVersion: 4,
      reasonCode: 'user_safety',
      targetPlayerId,
    });

    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(changed.correlationId).toBe(secondUuid);
  });

  it('removes a journal entry only after the matching receipt succeeds', async () => {
    const { journal, storage } = createJournal();
    const command = await journal.requestFriendship({
      accountId,
      expectedRelationshipVersion: 0,
      targetPlayerId,
    });

    await journal.complete({
      accountId,
      idempotencyKey: secondUuid,
      identity: targetPlayerId,
      operation: 'request-friendship',
    });
    expect(storage.removeItem).not.toHaveBeenCalled();

    await journal.complete({
      accountId,
      idempotencyKey: command.idempotencyKey,
      identity: targetPlayerId,
      operation: 'request-friendship',
    });
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });

  it('replaces corrupt persisted state instead of trusting it', async () => {
    const { journal, storage } = createJournal();
    storage.values.set(
      `@liqi-match/social-command-v2:${accountId}:request-friendship:${targetPlayerId}`,
      '{corrupt-json',
    );

    await expect(
      journal.requestFriendship({
        accountId,
        expectedRelationshipVersion: 0,
        targetPlayerId,
      }),
    ).resolves.toMatchObject({ correlationId: firstUuid });
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('builds privacy and report commands with their own aggregate versions', async () => {
    const { journal } = createJournal();
    const privacy = await journal.updatePrivacy({
      accountId,
      expectedPrivacyVersion: 2,
      friendshipRequests: 'matched_only',
      presenceVisibility: 'hidden',
      profileVisibility: 'friends',
      sessionInvites: 'nobody',
      trustVisibility: 'private',
    });
    const report = await journal.reportPlayer({
      accountId,
      category: 'harassment',
      details: 'Unsafe behavior',
      targetPlayerId,
    });

    expect(privacy).toMatchObject({ expectedPrivacyVersion: 2 });
    expect(report).toMatchObject({ expectedReportVersion: 0 });
  });
});
