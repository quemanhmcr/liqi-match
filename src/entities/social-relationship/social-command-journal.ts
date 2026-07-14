import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { AccountIdSchema } from '@/shared/contracts/core-v1';
import {
  AcceptFriendshipCommandV2Schema,
  BlockPlayerCommandV2Schema,
  CancelFriendshipCommandV2Schema,
  DeclineFriendshipCommandV2Schema,
  MutePlayerCommandV2Schema,
  RemoveFriendshipCommandV2Schema,
  ReportMessageCommandV2Schema,
  ReportPlayerCommandV2Schema,
  RequestFriendshipCommandV2Schema,
  UnblockPlayerCommandV2Schema,
  UnmutePlayerCommandV2Schema,
  UpdatePlayerPrivacyCommandV2Schema,
  type AcceptFriendshipCommandV2,
  type BlockPlayerCommandV2,
  type CancelFriendshipCommandV2,
  type DeclineFriendshipCommandV2,
  type MutePlayerCommandV2,
  type RemoveFriendshipCommandV2,
  type ReportCategoryV2,
  type ReportMessageCommandV2,
  type ReportPlayerCommandV2,
  type RequestFriendshipCommandV2,
  type UnblockPlayerCommandV2,
  type UnmutePlayerCommandV2,
  type UpdatePlayerPrivacyCommandV2,
} from '@/shared/contracts/core-v2';

type StoragePort = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;

type JournalOptions = Readonly<{
  clientPlatform?: 'ios' | 'android' | 'web' | 'service';
  clientVersion?: string;
  createUuid?: () => string;
  now?: () => Date;
  storage?: StoragePort;
}>;

const entrySchema = z
  .object({
    command: z.unknown(),
    fingerprint: z.string().min(1),
    version: z.literal(1),
  })
  .strict();

const namespace = '@liqi-match/social-command-v2';

export class SocialCommandJournal {
  private readonly clientPlatform: 'ios' | 'android' | 'web' | 'service';
  private readonly clientVersion: string;
  private readonly createUuid: () => string;
  private readonly now: () => Date;
  private readonly storage: StoragePort;

  constructor(options: JournalOptions = {}) {
    this.clientPlatform = options.clientPlatform ?? resolveClientPlatform();
    this.clientVersion = options.clientVersion ?? resolveClientVersion();
    this.createUuid = options.createUuid ?? createUuid;
    this.now = options.now ?? (() => new Date());
    this.storage = options.storage ?? AsyncStorage;
  }

  requestFriendship(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'request-friendship',
      input.accountId,
      input.targetPlayerId,
      input,
      RequestFriendshipCommandV2Schema,
    );
  }

  acceptFriendship(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    expectedRequestVersion: number;
    friendshipRequestId: string;
  }) {
    return this.prepare(
      'accept-friendship',
      input.accountId,
      input.friendshipRequestId,
      input,
      AcceptFriendshipCommandV2Schema,
    );
  }

  declineFriendship(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    expectedRequestVersion: number;
    friendshipRequestId: string;
  }) {
    return this.prepare(
      'decline-friendship',
      input.accountId,
      input.friendshipRequestId,
      input,
      DeclineFriendshipCommandV2Schema,
    );
  }

  cancelFriendship(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    expectedRequestVersion: number;
    friendshipRequestId: string;
  }) {
    return this.prepare(
      'cancel-friendship',
      input.accountId,
      input.friendshipRequestId,
      input,
      CancelFriendshipCommandV2Schema,
    );
  }

  removeFriendship(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'remove-friendship',
      input.accountId,
      input.targetPlayerId,
      input,
      RemoveFriendshipCommandV2Schema,
    );
  }

  blockPlayer(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    reasonCode?: string | null;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'block-player',
      input.accountId,
      input.targetPlayerId,
      input,
      BlockPlayerCommandV2Schema,
    );
  }

  unblockPlayer(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'unblock-player',
      input.accountId,
      input.targetPlayerId,
      input,
      UnblockPlayerCommandV2Schema,
    );
  }

  mutePlayer(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'mute-player',
      input.accountId,
      input.targetPlayerId,
      input,
      MutePlayerCommandV2Schema,
    );
  }

  unmutePlayer(input: {
    accountId: string;
    expectedRelationshipVersion: number;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'unmute-player',
      input.accountId,
      input.targetPlayerId,
      input,
      UnmutePlayerCommandV2Schema,
    );
  }

  updatePrivacy(
    input: Omit<
      UpdatePlayerPrivacyCommandV2,
      'audit' | 'correlationId' | 'idempotencyKey'
    > & {
      accountId: string;
    },
  ) {
    return this.prepare(
      'update-privacy',
      input.accountId,
      'self',
      input,
      UpdatePlayerPrivacyCommandV2Schema,
    );
  }

  reportPlayer(input: {
    accountId: string;
    category: ReportCategoryV2;
    details: string | null;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'report-player',
      input.accountId,
      input.targetPlayerId,
      { ...input, expectedReportVersion: 0 },
      ReportPlayerCommandV2Schema,
    );
  }

  reportMessage(input: {
    accountId: string;
    category: ReportCategoryV2;
    conversationId: string;
    details: string | null;
    messageId: string;
    targetPlayerId: string;
  }) {
    return this.prepare(
      'report-message',
      input.accountId,
      `${input.conversationId}:${input.messageId}`,
      { ...input, expectedReportVersion: 0 },
      ReportMessageCommandV2Schema,
    );
  }

  async complete(input: {
    accountId: string;
    identity: string;
    idempotencyKey: string;
    operation: SocialCommandOperation;
  }) {
    const key = storageKey(
      input.operation,
      AccountIdSchema.parse(input.accountId),
      input.identity,
    );
    const existing = await this.read(key);
    if (
      existing &&
      commandIdempotencyKey(existing.command) === input.idempotencyKey
    ) {
      await this.storage.removeItem(key);
    }
  }

  private async prepare<T>(
    operation: SocialCommandOperation,
    accountIdInput: string,
    identity: string,
    payload: object,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const accountId = AccountIdSchema.parse(accountIdInput);
    const key = storageKey(operation, accountId, identity);
    const fingerprint = stableJson(payload);
    const existing = await this.read(key);
    if (existing?.fingerprint === fingerprint) {
      const parsed = schema.safeParse(existing.command);
      if (parsed.success) return parsed.data;
    }

    const uuid = this.createUuid();
    const { accountId: _accountId, ...commandPayload } = payload as Record<
      string,
      unknown
    >;
    const command = schema.parse({
      ...commandPayload,
      audit: {
        clientCreatedAt: this.now().toISOString(),
        clientPlatform: this.clientPlatform,
        clientVersion: this.clientVersion,
        requestId: `social:${operation}:${uuid}`,
      },
      correlationId: uuid,
      idempotencyKey: `social:${operation}:${uuid}`,
    });
    await this.storage.setItem(
      key,
      JSON.stringify(entrySchema.parse({ command, fingerprint, version: 1 })),
    );
    return command;
  }

  private async read(key: string) {
    const raw = await this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = entrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Corrupt journal state is safely replaced by a fresh command.
    }
    await this.storage.removeItem(key);
    return null;
  }
}

export type SocialCommandOperation =
  | 'request-friendship'
  | 'accept-friendship'
  | 'decline-friendship'
  | 'cancel-friendship'
  | 'remove-friendship'
  | 'block-player'
  | 'unblock-player'
  | 'mute-player'
  | 'unmute-player'
  | 'update-privacy'
  | 'report-player'
  | 'report-message';

export type SocialJournalCommand =
  | RequestFriendshipCommandV2
  | AcceptFriendshipCommandV2
  | DeclineFriendshipCommandV2
  | CancelFriendshipCommandV2
  | RemoveFriendshipCommandV2
  | BlockPlayerCommandV2
  | UnblockPlayerCommandV2
  | MutePlayerCommandV2
  | UnmutePlayerCommandV2
  | UpdatePlayerPrivacyCommandV2
  | ReportPlayerCommandV2
  | ReportMessageCommandV2;

function commandIdempotencyKey(value: unknown) {
  return value && typeof value === 'object' && 'idempotencyKey' in value
    ? String(value.idempotencyKey)
    : null;
}

function storageKey(
  operation: SocialCommandOperation,
  accountId: string,
  identity: string,
) {
  return `${namespace}:${accountId}:${operation}:${identity}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveClientPlatform(): 'ios' | 'android' | 'web' | 'service' {
  try {
    const { Platform } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native') as typeof import('react-native');
    return Platform.OS === 'ios' ||
      Platform.OS === 'android' ||
      Platform.OS === 'web'
      ? Platform.OS
      : 'service';
  } catch {
    return 'service';
  }
}

function resolveClientVersion() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants')
      .default as typeof import('expo-constants').default;
    return Constants.expoConfig?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function createUuid() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
