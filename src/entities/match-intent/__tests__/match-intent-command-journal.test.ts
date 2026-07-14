import { describe, expect, it, jest } from '@jest/globals';

import { MatchIntentCommandJournal } from '../match-intent-command-journal';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => void values.delete(key)),
    setItem: jest.fn(
      async (key: string, value: string) => void values.set(key, value),
    ),
  };
}

const accountId = '00000000-0000-4000-8000-000000000001';
const filters = {
  intentKind: 'normal' as const,
  mode: 'normal' as const,
  partyFormat: 'duo' as const,
  roleSlugs: [],
  sessionPlan: 'quick' as const,
  timezone: 'Asia/Bangkok',
};

describe('MatchIntentCommandJournal', () => {
  it('reuses an unfinished activation after process restart', async () => {
    const driver = storage();
    const createUuid = jest.fn(() => '10000000-0000-4000-8000-000000000001');
    const first = new MatchIntentCommandJournal({
      createUuid,
      storage: driver,
    });
    const command = await first.activation({ accountId, filters });
    const restored = new MatchIntentCommandJournal({
      createUuid,
      storage: driver,
    });

    expect(await restored.activation({ accountId, filters })).toEqual(command);
    expect(createUuid).toHaveBeenCalledTimes(1);
  });

  it('clears only the command that was acknowledged by the server', async () => {
    const driver = storage();
    const journal = new MatchIntentCommandJournal({
      createUuid: () => '10000000-0000-4000-8000-000000000001',
      storage: driver,
    });
    const command = await journal.activation({ accountId, filters });

    await journal.complete('activate', accountId, 'different-key');
    expect(await journal.activation({ accountId, filters })).toEqual(command);

    await journal.complete('activate', accountId, command.idempotencyKey);
    await journal.activation({ accountId, filters });
    expect(driver.setItem).toHaveBeenCalledTimes(2);
  });
});
