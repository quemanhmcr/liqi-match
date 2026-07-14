import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import {
  AccountIdSchema,
  CreateSetInviteCommandV1Schema,
  MatchSetIdSchema,
  PlayerIdSchema,
  RequestSetJoinCommandV1Schema,
  type CreateSetInviteCommandV1,
  type RequestSetJoinCommandV1,
} from '@/shared/contracts/core-v1';

type StoragePort = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;
type Options = { createUuid?: () => string; storage?: StoragePort };
const namespace = '@liqi-match/match-set-command-v1';

const inviteEntrySchema = z.object({
  accountId: AccountIdSchema,
  command: CreateSetInviteCommandV1Schema,
  version: z.literal(1),
});
const joinEntrySchema = z.object({
  accountId: AccountIdSchema,
  command: RequestSetJoinCommandV1Schema,
  version: z.literal(1),
});

export class MatchSetCommandJournal {
  private readonly createUuid: () => string;
  private readonly storage: StoragePort;

  constructor(options: Options = {}) {
    this.createUuid = options.createUuid ?? createUuid;
    this.storage = options.storage ?? AsyncStorage;
  }

  async invite(input: {
    accountId: string;
    expectedSetVersion: number;
    setId: string;
    targetPlayerId: string;
  }): Promise<CreateSetInviteCommandV1> {
    const accountId = AccountIdSchema.parse(input.accountId);
    const setId = MatchSetIdSchema.parse(input.setId);
    const targetPlayerId = PlayerIdSchema.parse(input.targetPlayerId);
    const key = `${namespace}:invite:${accountId}:${setId}:${targetPlayerId}`;
    const existing = await this.read(key, inviteEntrySchema);
    if (
      existing &&
      existing.command.expectedSetVersion === input.expectedSetVersion
    ) {
      return existing.command;
    }
    const uuid = this.createUuid();
    const command = CreateSetInviteCommandV1Schema.parse({
      correlationId: uuid,
      expectedSetVersion: input.expectedSetVersion,
      idempotencyKey: `set-invite:${uuid}`,
      setId,
      targetPlayerId,
    });
    await this.storage.setItem(
      key,
      JSON.stringify(
        inviteEntrySchema.parse({ accountId, command, version: 1 }),
      ),
    );
    return command;
  }

  async requestJoin(input: {
    accountId: string;
    expectedSetVersion: number;
    setId: string;
  }): Promise<RequestSetJoinCommandV1> {
    const accountId = AccountIdSchema.parse(input.accountId);
    const setId = MatchSetIdSchema.parse(input.setId);
    const key = `${namespace}:join:${accountId}:${setId}`;
    const existing = await this.read(key, joinEntrySchema);
    if (
      existing &&
      existing.command.expectedSetVersion === input.expectedSetVersion
    ) {
      return existing.command;
    }
    const uuid = this.createUuid();
    const command = RequestSetJoinCommandV1Schema.parse({
      correlationId: uuid,
      expectedSetVersion: input.expectedSetVersion,
      idempotencyKey: `set-join:${uuid}`,
      setId,
    });
    await this.storage.setItem(
      key,
      JSON.stringify(joinEntrySchema.parse({ accountId, command, version: 1 })),
    );
    return command;
  }

  async complete(input: {
    accountId: string;
    kind: 'invite' | 'join';
    setId: string;
    targetPlayerId?: string;
  }) {
    const accountId = AccountIdSchema.parse(input.accountId);
    const setId = MatchSetIdSchema.parse(input.setId);
    const suffix =
      input.kind === 'invite'
        ? `invite:${accountId}:${setId}:${PlayerIdSchema.parse(input.targetPlayerId)}`
        : `join:${accountId}:${setId}`;
    await this.storage.removeItem(`${namespace}:${suffix}`);
  }

  private async read<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
    const raw = await this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Replace corrupt local command state with a fresh durable command.
    }
    await this.storage.removeItem(key);
    return null;
  }
}

function createUuid() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
