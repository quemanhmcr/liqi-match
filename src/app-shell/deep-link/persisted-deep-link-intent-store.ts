import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createPendingDeepLinkIntentV1,
  pendingDeepLinkIntentV1Schema,
  type EnqueueDeepLinkIntentInput,
  type PendingDeepLinkIntentV1,
} from './deep-link-intent';

export const pendingDeepLinkIntentStorageKey =
  '@liqi/deep-link-intent/v1' as const;

export type DeepLinkIntentStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}>;

export type ClaimPendingDeepLinkIntentInput = Readonly<{
  leaseDurationMs: number;
  now: string;
}>;

export class PersistedDeepLinkIntentStore {
  private operation = Promise.resolve();

  constructor(
    private readonly storage: DeepLinkIntentStorage = AsyncStorage,
    private readonly storageKey = pendingDeepLinkIntentStorageKey,
  ) {}

  enqueue(input: EnqueueDeepLinkIntentInput): Promise<PendingDeepLinkIntentV1> {
    return this.serialized(async () => {
      const candidate = createPendingDeepLinkIntentV1(input);
      const current = await this.readUnsafe();
      if (current?.intentId === candidate.intentId) return current;
      await this.writeUnsafe(candidate);
      return candidate;
    });
  }

  peek(): Promise<PendingDeepLinkIntentV1 | null> {
    return this.serialized(() => this.readUnsafe());
  }

  claim(
    input: ClaimPendingDeepLinkIntentInput,
  ): Promise<PendingDeepLinkIntentV1 | null> {
    return this.serialized(async () => {
      const current = await this.readUnsafe();
      if (!current) return null;

      const nowMs = Date.parse(input.now);
      if (!Number.isFinite(nowMs)) {
        throw new Error('Deep-link claim time must be an ISO datetime.');
      }
      if (Date.parse(current.expiresAt) <= nowMs) {
        await this.storage.removeItem(this.storageKey);
        return null;
      }
      if (
        current.claimedAt &&
        Date.parse(current.claimedAt) + input.leaseDurationMs > nowMs
      ) {
        return null;
      }

      const claimed = pendingDeepLinkIntentV1Schema.parse({
        ...current,
        attempts: current.attempts + 1,
        claimedAt: input.now,
      });
      await this.writeUnsafe(claimed);
      return claimed;
    });
  }

  complete(intentId: string): Promise<boolean> {
    return this.serialized(async () => {
      const current = await this.readUnsafe();
      if (!current || current.intentId !== intentId) return false;
      await this.storage.removeItem(this.storageKey);
      return true;
    });
  }

  release(intentId: string): Promise<boolean> {
    return this.serialized(async () => {
      const current = await this.readUnsafe();
      if (!current || current.intentId !== intentId) return false;
      await this.writeUnsafe(
        pendingDeepLinkIntentV1Schema.parse({
          ...current,
          claimedAt: null,
        }),
      );
      return true;
    });
  }

  clear(): Promise<void> {
    return this.serialized(() => this.storage.removeItem(this.storageKey));
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readUnsafe() {
    const raw = await this.storage.getItem(this.storageKey);
    if (!raw) return null;

    try {
      return pendingDeepLinkIntentV1Schema.parse(JSON.parse(raw) as unknown);
    } catch {
      await this.storage.removeItem(this.storageKey);
      return null;
    }
  }

  private writeUnsafe(intent: PendingDeepLinkIntentV1) {
    return this.storage.setItem(this.storageKey, JSON.stringify(intent));
  }
}
