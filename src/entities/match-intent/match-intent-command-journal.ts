import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import {
  AccountIdSchema,
  IdempotencyKeySchema,
  MatchIntentFiltersV1Schema,
  type MatchIntentFiltersV1,
} from '@/shared/contracts/core-v1';

const activationEntrySchema = z.object({
  accountId: AccountIdSchema,
  expectedVersion: z.number().int().positive().nullable(),
  filters: MatchIntentFiltersV1Schema,
  idempotencyKey: IdempotencyKeySchema,
  version: z.literal(1),
});

const commandIdentitySchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
});

const pauseEntrySchema = z.object({
  accountId: AccountIdSchema,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: IdempotencyKeySchema,
  version: z.literal(1),
});

type StoragePort = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;

type JournalOptions = {
  createUuid?: () => string;
  storage?: StoragePort;
};

const namespace = '@liqi-match/match-intent-command-v1';

export class MatchIntentCommandJournal {
  private readonly createUuid: () => string;
  private readonly storage: StoragePort;

  constructor(options: JournalOptions = {}) {
    this.createUuid = options.createUuid ?? createUuid;
    this.storage = options.storage ?? AsyncStorage;
  }

  async activation(input: {
    accountId: string;
    expectedVersion?: number;
    filters: MatchIntentFiltersV1;
  }) {
    const accountId = AccountIdSchema.parse(input.accountId);
    const filters = MatchIntentFiltersV1Schema.parse(input.filters);
    const key = storageKey('activate', accountId);
    const existing = await this.read(key, activationEntrySchema);

    if (
      existing &&
      existing.expectedVersion === (input.expectedVersion ?? null) &&
      stableJson(existing.filters) === stableJson(filters)
    ) {
      return existing;
    }

    const entry = activationEntrySchema.parse({
      accountId,
      expectedVersion: input.expectedVersion ?? null,
      filters,
      idempotencyKey: `match-intent-activate:${this.createUuid()}`,
      version: 1,
    });
    await this.storage.setItem(key, JSON.stringify(entry));
    return entry;
  }

  async pause(input: { accountId: string; expectedVersion: number }) {
    const accountId = AccountIdSchema.parse(input.accountId);
    const key = storageKey('pause', accountId);
    const existing = await this.read(key, pauseEntrySchema);
    if (existing?.expectedVersion === input.expectedVersion) return existing;

    const entry = pauseEntrySchema.parse({
      accountId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: `match-intent-pause:${this.createUuid()}`,
      version: 1,
    });
    await this.storage.setItem(key, JSON.stringify(entry));
    return entry;
  }

  async complete(
    operation: 'activate' | 'pause',
    accountIdInput: string,
    idempotencyKey: string,
  ) {
    const accountId = AccountIdSchema.parse(accountIdInput);
    const key = storageKey(operation, accountId);
    const existing = await this.read(key, commandIdentitySchema);
    if (existing?.idempotencyKey === idempotencyKey) {
      await this.storage.removeItem(key);
    }
  }

  private async read<T>(key: string, schema: z.ZodType<T>) {
    const raw = await this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Corrupt local journal data is recoverable by replacing the entry.
    }
    await this.storage.removeItem(key);
    return null;
  }
}

function storageKey(operation: 'activate' | 'pause', accountId: string) {
  return `${namespace}:${accountId}:${operation}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function createUuid() {
  // Lazy native import keeps pure domain/journal tests independent of Expo ESM.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
