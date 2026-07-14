import { expect, it, jest } from '@jest/globals';

import { MatchSetCommandJournal } from '../match-set-command-journal';

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

it('restores the same join command after restart', async () => {
  const driver = storage();
  const createUuid = jest.fn(() => '70000000-0000-4000-8000-000000000001');
  const input = {
    accountId: '00000000-0000-4000-8000-000000000001',
    expectedSetVersion: 3,
    setId: 'a1000000-0000-4000-8000-000000000001',
  };
  const first = new MatchSetCommandJournal({ createUuid, storage: driver });
  const command = await first.requestJoin(input);
  const restored = new MatchSetCommandJournal({
    createUuid,
    storage: driver,
  });

  expect(await restored.requestJoin(input)).toEqual(command);
  expect(createUuid).toHaveBeenCalledTimes(1);
});
