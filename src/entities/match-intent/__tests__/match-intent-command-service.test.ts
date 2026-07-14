import { describe, expect, it, jest } from '@jest/globals';

import {
  AccountIdSchema,
  ActivateMatchIntentReceiptV1Schema,
  IdempotencyKeySchema,
  PauseMatchIntentReceiptV1Schema,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

import type { MatchIntentCommandJournal } from '../match-intent-command-journal';
import {
  activateMatchIntent,
  pauseMatchIntent,
} from '../match-intent-command-service';
import type { MatchIntentRepository } from '../match-intent-repository';

const session: AuthSession = {
  accessToken: 'access',
  expiresAt: 9_999_999_999,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: { id: '00000000-0000-4000-8000-000000000001' },
};
const filters = {
  intentKind: 'rank' as const,
  mode: 'ranked' as const,
  partyFormat: 'duo' as const,
  roleSlugs: ['jungle'],
  sessionPlan: 'quick' as const,
  timezone: 'Asia/Bangkok',
};
const activeReceipt = ActivateMatchIntentReceiptV1Schema.parse({
  activatedAt: '2026-07-14T08:00:00.000Z',
  expiresAt: '2026-07-14T10:00:00.000Z',
  filters,
  matchIntentId: '10000000-0000-4000-8000-000000000001',
  playerId: '20000000-0000-4000-8000-000000000001',
  repeated: false,
  state: 'active',
  version: 2,
});
const pausedReceipt = PauseMatchIntentReceiptV1Schema.parse({
  ...activeReceipt,
  activatedAt: null,
  expiresAt: null,
  state: 'paused',
  version: 3,
});
const accountId = AccountIdSchema.parse(session.user.id);
const activationIdempotencyKey = IdempotencyKeySchema.parse(
  'match-intent-activate:journal-command-1',
);
const pauseIdempotencyKey = IdempotencyKeySchema.parse(
  'match-intent-pause:journal-command-1',
);
const activationEntry: Awaited<
  ReturnType<MatchIntentCommandJournal['activation']>
> = {
  accountId,
  expectedVersion: null,
  filters,
  idempotencyKey: activationIdempotencyKey,
  version: 1,
};
const pauseEntry: Awaited<ReturnType<MatchIntentCommandJournal['pause']>> = {
  accountId,
  expectedVersion: 2,
  idempotencyKey: pauseIdempotencyKey,
  version: 1,
};

function createJournal() {
  return {
    activation: jest
      .fn<MatchIntentCommandJournal['activation']>()
      .mockResolvedValue(activationEntry),
    complete: jest
      .fn<MatchIntentCommandJournal['complete']>()
      .mockResolvedValue(undefined),
    pause: jest
      .fn<MatchIntentCommandJournal['pause']>()
      .mockResolvedValue(pauseEntry),
  };
}

function createRepository(input: {
  activate?: MatchIntentRepository['activate'];
  pause?: MatchIntentRepository['pause'];
}): MatchIntentRepository {
  return {
    activate:
      input.activate ??
      jest
        .fn<MatchIntentRepository['activate']>()
        .mockResolvedValue(activeReceipt),
    getCurrent: jest
      .fn<MatchIntentRepository['getCurrent']>()
      .mockResolvedValue(null),
    pause:
      input.pause ??
      jest
        .fn<MatchIntentRepository['pause']>()
        .mockResolvedValue(pausedReceipt),
  };
}

describe('Match Intent command service', () => {
  it('preserves the activation journal identity through repository success', async () => {
    const journal = createJournal();
    const repository = createRepository({});

    await expect(
      activateMatchIntent({ filters, journal, repository, session }),
    ).resolves.toEqual(activeReceipt);
    expect(repository.activate).toHaveBeenCalledWith(session, {
      filters,
      idempotencyKey: activationIdempotencyKey,
    });
    expect(journal.complete).toHaveBeenCalledWith(
      'activate',
      accountId,
      activationIdempotencyKey,
    );
  });

  it('does not clear a pause journal entry when the repository fails', async () => {
    const failure = new Error('network unavailable');
    const journal = createJournal();
    const repository = createRepository({
      pause: jest
        .fn<MatchIntentRepository['pause']>()
        .mockRejectedValue(failure),
    });

    await expect(
      pauseMatchIntent({
        expectedVersion: 2,
        journal,
        repository,
        session,
      }),
    ).rejects.toBe(failure);
    expect(journal.complete).not.toHaveBeenCalled();
  });

  it('clears the pause journal only after a validated receipt returns', async () => {
    const journal = createJournal();
    const repository = createRepository({});

    await expect(
      pauseMatchIntent({
        expectedVersion: 2,
        journal,
        repository,
        session,
      }),
    ).resolves.toEqual(pausedReceipt);
    expect(journal.complete).toHaveBeenCalledWith(
      'pause',
      accountId,
      pauseIdempotencyKey,
    );
  });
});
