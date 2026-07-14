import AsyncStorage from '@react-native-async-storage/async-storage';

export const pushDeviceInstallationStorageKey =
  '@liqi/push-device-installation/v1' as const;

export interface PushDeviceInstallationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class PushDeviceInstallationStore {
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly createId: () => string,
    private readonly storage: PushDeviceInstallationStorage = AsyncStorage,
    private readonly storageKey = pushDeviceInstallationStorageKey,
  ) {}

  getOrCreate(): Promise<string> {
    this.inFlight ??= this.getOrCreateUnsafe().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async getOrCreateUnsafe() {
    const existing = await this.storage.getItem(this.storageKey);
    if (existing?.trim()) return existing;

    const created = this.createId();
    if (!created.trim()) throw new Error('Generated installation ID is empty.');
    await this.storage.setItem(this.storageKey, created);
    return created;
  }
}
