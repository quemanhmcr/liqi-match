import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import {
  AccountIdSchema,
  IdempotencyKeySchema,
  PlayerDecisionCommandV1Schema,
  PlayerIdSchema,
  type PlayerDecisionCommandV1,
} from '@/shared/contracts/core-v1';

const entrySchema = z.object({
  accountId: AccountIdSchema,
  command: PlayerDecisionCommandV1Schema,
  version: z.literal(1),
});

type StoragePort = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;

type Options = { createUuid?: () => string; storage?: StoragePort };
const namespace = '@liqi-match/player-decision-command-v1';

export class MatchDecisionCommandJournal {
  private readonly createUuid: () => string;
  private readonly storage: StoragePort;

  constructor(options: Options = {}) {
    this.createUuid = options.createUuid ?? createUuid;
    this.storage = options.storage ?? AsyncStorage;
  }

  async command(input: {
    accountId: string;
    decision: 'like' | 'pass';
    expectedIntentVersion: number;
    expectedTargetProfileVersion: number;
    targetPlayerId: string;
  }): Promise<PlayerDecisionCommandV1> {
    const accountId = AccountIdSchema.parse(input.accountId);
    const targetPlayerId = PlayerIdSchema.parse(input.targetPlayerId);
    const key = storageKey(accountId, targetPlayerId, input.decision);
    const existing = await this.read(key);
    if (
      existing &&
      existing.command.expectedIntentVersion === input.expectedIntentVersion &&
      existing.command.expectedTargetProfileVersion ===
        input.expectedTargetProfileVersion
    ) {
      return existing.command;
    }

    const uuid = this.createUuid();
    const command = PlayerDecisionCommandV1Schema.parse({
      correlationId: uuid,
      decision: input.decision,
      expectedIntentVersion: input.expectedIntentVersion,
      expectedTargetProfileVersion: input.expectedTargetProfileVersion,
      idempotencyKey: `player-decision:${uuid}`,
      targetPlayerId,
    });
    await this.storage.setItem(
      key,
      JSON.stringify(entrySchema.parse({ accountId, command, version: 1 })),
    );
    return command;
  }

  async complete(accountIdInput: string, command: PlayerDecisionCommandV1) {
    const accountId = AccountIdSchema.parse(accountIdInput);
    IdempotencyKeySchema.parse(command.idempotencyKey);
    const key = storageKey(accountId, command.targetPlayerId, command.decision);
    const existing = await this.read(key);
    if (existing?.command.idempotencyKey === command.idempotencyKey) {
      await this.storage.removeItem(key);
    }
  }

  private async read(key: string) {
    const raw = await this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = entrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Replace corrupt local command state with a fresh durable command.
    }
    await this.storage.removeItem(key);
    return null;
  }
}

function storageKey(
  accountId: string,
  targetPlayerId: string,
  decision: 'like' | 'pass',
) {
  return `${namespace}:${accountId}:${targetPlayerId}:${decision}`;
}

function createUuid() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
