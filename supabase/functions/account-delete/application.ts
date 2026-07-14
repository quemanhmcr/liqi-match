export type AccountDeletionCommand = Readonly<{
  confirmation: 'DELETE';
  expectedLifecycleVersion: number;
  idempotencyKey: string;
}>;

export type AccountDeletionReceipt = Readonly<{
  lifecycle: Readonly<{
    playerId: string;
    profileId: string;
    state: string;
    version: number;
  }>;
  repeated: boolean;
}>;

export type AccountDeletionMediaAsset = Readonly<{
  id: string;
  objectKey: string;
}>;

export type AccountDeletionCleanupResult = Readonly<{
  error?: string;
  name: string;
  ok: boolean;
}>;

export type AccountDeletionResources = Readonly<{
  media: readonly AccountDeletionMediaAsset[];
  profileFound: boolean;
}>;

export type AccountDeletionPorts = Readonly<{
  cleanupProfileData(
    accountId: string,
    deletedAt: string,
  ): Promise<readonly AccountDeletionCleanupResult[]>;
  deleteAuthUser(accountId: string): Promise<void>;
  deleteMedia(
    asset: AccountDeletionMediaAsset,
  ): Promise<Readonly<{ ok: boolean; status: number }>>;
  lookupResources(accountId: string): Promise<AccountDeletionResources>;
  now(): string;
  requestDeletion(
    command: AccountDeletionCommand,
  ): Promise<AccountDeletionReceipt>;
}>;

export type AccountDeletionResult = Readonly<{
  cleanup: Readonly<{
    attempted: number;
    failed: readonly string[];
    succeeded: number;
  }>;
  deletedAt: string;
  lifecycleVersion: number;
  mediaDeleted: number;
  playerId: string;
  profileFound: boolean;
  profileId: string;
  repeated: boolean;
  status: 'deleted';
}>;

export class AccountDeletionApplicationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AccountDeletionApplicationError';
  }
}

export async function executeAccountDeletion(
  accountId: string,
  command: AccountDeletionCommand,
  ports: AccountDeletionPorts,
): Promise<AccountDeletionResult> {
  validateInput(accountId, command);

  const receipt = await ports.requestDeletion(command);
  assertDeletingReceipt(receipt);

  const resources = await ports.lookupResources(accountId);
  const mediaFailures: Array<Readonly<{ assetId: string; status: number }>> =
    [];
  let mediaDeleted = 0;

  for (const asset of resources.media) {
    const result = await ports.deleteMedia(asset);
    if (result.ok) mediaDeleted += 1;
    else mediaFailures.push({ assetId: asset.id, status: result.status });
  }

  if (mediaFailures.length > 0) {
    throw new AccountDeletionApplicationError(
      'Could not delete all account media. The player remains in deleting state.',
      'account_deletion_media_incomplete',
      502,
      true,
      { failures: mediaFailures },
    );
  }

  const deletedAt = ports.now();
  const cleanupResults = resources.profileFound
    ? await ports.cleanupProfileData(accountId, deletedAt)
    : [];
  const failedCleanup = cleanupResults.filter((result) => !result.ok);

  if (failedCleanup.length > 0) {
    throw new AccountDeletionApplicationError(
      'Account data cleanup is incomplete. Auth identity was not deleted.',
      'account_deletion_cleanup_incomplete',
      503,
      true,
      {
        failed: failedCleanup.map((result) => ({
          error: result.error,
          name: result.name,
        })),
      },
    );
  }

  await ports.deleteAuthUser(accountId);

  return {
    cleanup: {
      attempted: cleanupResults.length,
      failed: [],
      succeeded: cleanupResults.length,
    },
    deletedAt,
    lifecycleVersion: receipt.lifecycle.version + 1,
    mediaDeleted,
    playerId: receipt.lifecycle.playerId,
    profileFound: resources.profileFound,
    profileId: receipt.lifecycle.profileId,
    repeated: receipt.repeated,
    status: 'deleted',
  };
}

function validateInput(
  accountId: string,
  command: AccountDeletionCommand,
): void {
  if (!accountId) {
    throw new AccountDeletionApplicationError(
      'Authenticated AccountId is required.',
      'unauthenticated',
      401,
      false,
    );
  }
  if (command.confirmation !== 'DELETE') {
    throw new AccountDeletionApplicationError(
      'Account deletion requires explicit DELETE confirmation.',
      'validation_failed',
      400,
      false,
    );
  }
  if (
    !Number.isSafeInteger(command.expectedLifecycleVersion) ||
    command.expectedLifecycleVersion <= 0
  ) {
    throw new AccountDeletionApplicationError(
      'expectedLifecycleVersion must be a positive integer.',
      'validation_failed',
      400,
      false,
    );
  }
  if (
    command.idempotencyKey.length < 16 ||
    command.idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(command.idempotencyKey)
  ) {
    throw new AccountDeletionApplicationError(
      'idempotencyKey must be 16-128 URL-safe characters.',
      'validation_failed',
      400,
      false,
    );
  }
}

function assertDeletingReceipt(receipt: AccountDeletionReceipt): void {
  if (
    receipt.lifecycle.state !== 'deleting' ||
    !receipt.lifecycle.playerId ||
    !receipt.lifecycle.profileId ||
    !Number.isSafeInteger(receipt.lifecycle.version) ||
    receipt.lifecycle.version <= 0 ||
    typeof receipt.repeated !== 'boolean'
  ) {
    throw new AccountDeletionApplicationError(
      'Deletion command did not return an authoritative deleting snapshot.',
      'account_deletion_lifecycle_invalid',
      500,
      true,
    );
  }
}
