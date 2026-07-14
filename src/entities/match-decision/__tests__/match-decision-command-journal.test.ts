import { expect, it, jest } from '@jest/globals';

import { MatchDecisionCommandJournal } from '../match-decision-command-journal';

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

it('restores the same decision command after process restart', async () => {
  const driver = storage();
  const createUuid = jest.fn(() => '70000000-0000-4000-8000-000000000001');
  const first = new MatchDecisionCommandJournal({
    createUuid,
    storage: driver,
  });
  const input = {
    accountId: '00000000-0000-4000-8000-000000000001',
    decision: 'like' as const,
    expectedIntentVersion: 2,
    expectedTargetProfileVersion: 4,
    targetPlayerId: '20000000-0000-4000-8000-000000000002',
  };
  const command = await first.command(input);
  const restored = new MatchDecisionCommandJournal({
    createUuid,
    storage: driver,
  });

  expect(await restored.command(input)).toEqual(command);
  expect(createUuid).toHaveBeenCalledTimes(1);
});
