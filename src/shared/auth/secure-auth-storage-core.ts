export interface AuthStringStorage {
  readonly isServer?: boolean;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecureAuthStorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type SecureAuthStorageEvent =
  'corruption_detected' | 'fallback_recovered' | 'cleanup_failed';

export type SecureAuthStorageTelemetry = (
  event: SecureAuthStorageEvent,
  details: Readonly<{ logicalKeyHash: string; slot?: StorageSlot }>,
) => void;

export type StorageSlot = 'a' | 'b';

type SlotManifest = Readonly<{
  formatVersion: 1;
  chunkCount: number;
  byteLength: number;
  checksum: string;
}>;

type SlotReadResult =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'valid'; manifest: SlotManifest; value: string }>;

export type ChunkedSecureAuthStorageOptions = Readonly<{
  backend: SecureAuthStorageBackend;
  digest: (value: string) => Promise<string>;
  telemetry?: SecureAuthStorageTelemetry;
  chunkByteLimit?: number;
  maximumValueBytes?: number;
}>;

const FORMAT_VERSION = 1 as const;
const DEFAULT_CHUNK_BYTE_LIMIT = 1_500;
const DEFAULT_MAXIMUM_VALUE_BYTES = 96 * 1024;
const POINTER_VALUE_PATTERN = /^[ab]$/;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;
const STORAGE_KEY_PREFIX = 'liqi.auth.v1';

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }
  return length;
}

export function splitByUtf8ByteLength(
  value: string,
  byteLimit: number,
): readonly string[] {
  if (!Number.isInteger(byteLimit) || byteLimit <= 0) {
    throw new Error('byteLimit must be a positive integer.');
  }
  if (value === '') return [''];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (characterBytes > byteLimit) {
      throw new Error('byteLimit is too small for a UTF-8 code point.');
    }
    if (current !== '' && currentBytes + characterBytes > byteLimit) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }

  chunks.push(current);
  return chunks;
}

function parseSlotManifest(raw: string | null): SlotManifest | null {
  if (raw === null) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<SlotManifest>;
    if (
      candidate.formatVersion !== FORMAT_VERSION ||
      !Number.isInteger(candidate.chunkCount) ||
      (candidate.chunkCount ?? 0) <= 0 ||
      !Number.isInteger(candidate.byteLength) ||
      (candidate.byteLength ?? -1) < 0 ||
      typeof candidate.checksum !== 'string' ||
      !CHECKSUM_PATTERN.test(candidate.checksum)
    ) {
      return null;
    }
    return candidate as SlotManifest;
  } catch {
    return null;
  }
}

function oppositeSlot(slot: StorageSlot): StorageSlot {
  return slot === 'a' ? 'b' : 'a';
}

export class ChunkedSecureAuthStorage implements AuthStringStorage {
  readonly isServer = false;

  private readonly backend: SecureAuthStorageBackend;
  private readonly digest: (value: string) => Promise<string>;
  private readonly telemetry?: SecureAuthStorageTelemetry;
  private readonly chunkByteLimit: number;
  private readonly maximumValueBytes: number;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: ChunkedSecureAuthStorageOptions) {
    this.backend = options.backend;
    this.digest = options.digest;
    this.telemetry = options.telemetry;
    this.chunkByteLimit = options.chunkByteLimit ?? DEFAULT_CHUNK_BYTE_LIMIT;
    this.maximumValueBytes =
      options.maximumValueBytes ?? DEFAULT_MAXIMUM_VALUE_BYTES;
  }

  getItem(key: string): Promise<string | null> {
    return this.runExclusive(key, async () => {
      const namespace = await this.namespaceFor(key);
      const pointer = await this.backend.getItem(this.pointerKey(namespace));
      if (pointer === null) return null;
      if (!POINTER_VALUE_PATTERN.test(pointer)) {
        await this.clearNamespace(namespace);
        this.emit('corruption_detected', namespace);
        return null;
      }

      const activeSlot = pointer as StorageSlot;
      const active = await this.readSlot(namespace, activeSlot);
      if (active.kind === 'valid') return active.value;

      const fallbackSlot = oppositeSlot(activeSlot);
      const fallback = await this.readSlot(namespace, fallbackSlot);
      if (fallback.kind === 'valid') {
        await this.backend.setItem(this.pointerKey(namespace), fallbackSlot);
        await this.bestEffortCleanup(
          () => this.cleanupSlot(namespace, activeSlot, undefined, true),
          namespace,
        );
        this.emit('fallback_recovered', namespace, fallbackSlot);
        return fallback.value;
      }

      await this.clearNamespace(namespace);
      this.emit('corruption_detected', namespace, activeSlot);
      return null;
    });
  }

  setItem(key: string, value: string): Promise<void> {
    return this.runExclusive(key, async () => {
      const valueBytes = utf8ByteLength(value);
      if (valueBytes > this.maximumValueBytes) {
        throw new Error(
          `Secure auth value exceeds ${this.maximumValueBytes} UTF-8 bytes.`,
        );
      }

      const namespace = await this.namespaceFor(key);
      const pointerRaw = await this.backend.getItem(this.pointerKey(namespace));
      const activeSlot = POINTER_VALUE_PATTERN.test(pointerRaw ?? '')
        ? (pointerRaw as StorageSlot)
        : null;
      const targetSlot = activeSlot === null ? 'a' : oppositeSlot(activeSlot);
      const previousTargetManifest = parseSlotManifest(
        await this.backend.getItem(this.manifestKey(namespace, targetSlot)),
      );
      const chunks = splitByUtf8ByteLength(value, this.chunkByteLimit);
      const manifest: SlotManifest = {
        formatVersion: FORMAT_VERSION,
        chunkCount: chunks.length,
        byteLength: valueBytes,
        checksum: await this.digest(value),
      };

      for (const [index, chunk] of chunks.entries()) {
        await this.backend.setItem(
          this.chunkKey(namespace, targetSlot, index),
          chunk,
        );
      }
      await this.backend.setItem(
        this.manifestKey(namespace, targetSlot),
        JSON.stringify(manifest),
      );
      await this.backend.setItem(this.pointerKey(namespace), targetSlot);

      await this.bestEffortCleanup(async () => {
        if (activeSlot !== null) {
          await this.cleanupSlot(namespace, activeSlot);
        }
        if (
          previousTargetManifest !== null &&
          previousTargetManifest.chunkCount > chunks.length
        ) {
          for (
            let index = chunks.length;
            index < previousTargetManifest.chunkCount;
            index += 1
          ) {
            await this.backend.removeItem(
              this.chunkKey(namespace, targetSlot, index),
            );
          }
        }
      }, namespace);
    });
  }

  removeItem(key: string): Promise<void> {
    return this.runExclusive(key, async () => {
      const namespace = await this.namespaceFor(key);
      await this.clearNamespace(namespace);
    });
  }

  private runExclusive<T>(
    logicalKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(logicalKey) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(logicalKey, settled);
    return result.finally(() => {
      if (this.queues.get(logicalKey) === settled) {
        this.queues.delete(logicalKey);
      }
    });
  }

  private async namespaceFor(logicalKey: string): Promise<string> {
    if (logicalKey === '') throw new Error('Auth storage key cannot be empty.');
    const hash = await this.digest(`key:${logicalKey}`);
    return `${STORAGE_KEY_PREFIX}.${hash.slice(0, 32)}`;
  }

  private pointerKey(namespace: string): string {
    return `${namespace}.active`;
  }

  private manifestKey(namespace: string, slot: StorageSlot): string {
    return `${namespace}.${slot}.meta`;
  }

  private chunkKey(
    namespace: string,
    slot: StorageSlot,
    index: number,
  ): string {
    return `${namespace}.${slot}.c${index}`;
  }

  private async readSlot(
    namespace: string,
    slot: StorageSlot,
  ): Promise<SlotReadResult> {
    const manifestRaw = await this.backend.getItem(
      this.manifestKey(namespace, slot),
    );
    if (manifestRaw === null) return { kind: 'missing' };
    const manifest = parseSlotManifest(manifestRaw);
    if (manifest === null) return { kind: 'invalid' };

    const chunks: string[] = [];
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const chunk = await this.backend.getItem(
        this.chunkKey(namespace, slot, index),
      );
      if (chunk === null) return { kind: 'invalid' };
      chunks.push(chunk);
    }

    const value = chunks.join('');
    if (
      utf8ByteLength(value) !== manifest.byteLength ||
      (await this.digest(value)) !== manifest.checksum
    ) {
      return { kind: 'invalid' };
    }
    return { kind: 'valid', manifest, value };
  }

  private async cleanupSlot(
    namespace: string,
    slot: StorageSlot,
    knownManifest?: SlotManifest,
    exhaustiveOnInvalid = false,
  ): Promise<void> {
    const manifestRaw = await this.backend.getItem(
      this.manifestKey(namespace, slot),
    );
    const manifest = knownManifest ?? parseSlotManifest(manifestRaw);
    const chunkCount =
      manifest?.chunkCount ??
      (exhaustiveOnInvalid
        ? Math.ceil(this.maximumValueBytes / this.chunkByteLimit)
        : 0);
    for (let index = 0; index < chunkCount; index += 1) {
      await this.backend.removeItem(this.chunkKey(namespace, slot, index));
    }
    await this.backend.removeItem(this.manifestKey(namespace, slot));
  }

  private async clearNamespace(namespace: string): Promise<void> {
    const cleanupResults = await Promise.allSettled([
      this.cleanupSlot(namespace, 'a', undefined, true),
      this.cleanupSlot(namespace, 'b', undefined, true),
    ]);

    // The active pointer is the restore authority. Remove it even when deleting
    // an orphan encrypted chunk fails, so a signed-out session cannot revive.
    await this.backend.removeItem(this.pointerKey(namespace));

    if (cleanupResults.some((result) => result.status === 'rejected')) {
      this.emit('cleanup_failed', namespace);
    }
  }

  private async bestEffortCleanup(
    cleanup: () => Promise<void>,
    namespace: string,
  ): Promise<void> {
    try {
      await cleanup();
    } catch {
      this.emit('cleanup_failed', namespace);
    }
  }

  private emit(
    event: SecureAuthStorageEvent,
    namespace: string,
    slot?: StorageSlot,
  ): void {
    this.telemetry?.(event, {
      logicalKeyHash: namespace.slice(`${STORAGE_KEY_PREFIX}.`.length),
      slot,
    });
  }
}

export class MemoryAuthStorage implements AuthStringStorage {
  readonly isServer = false;
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}
