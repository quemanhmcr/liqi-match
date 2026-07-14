import { describe, expect, it, jest } from '@jest/globals';

import {
  PushDeviceInstallationStore,
  type PushDeviceInstallationStorage,
} from '@/app-shell/push';

class MemoryStorage implements PushDeviceInstallationStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('PushDeviceInstallationStore', () => {
  it('creates once across concurrent callers and survives service recreation', async () => {
    const storage = new MemoryStorage();
    const createId = jest.fn(() => 'installation-a');
    const first = new PushDeviceInstallationStore(createId, storage);

    await expect(
      Promise.all([first.getOrCreate(), first.getOrCreate()]),
    ).resolves.toEqual(['installation-a', 'installation-a']);
    const second = new PushDeviceInstallationStore(
      () => 'installation-b',
      storage,
    );
    await expect(second.getOrCreate()).resolves.toBe('installation-a');
    expect(createId).toHaveBeenCalledTimes(1);
  });
});
