import { parseAssetKey } from './asset-key';
import type { AssetManifest, AssetManifestEntry } from './asset-types';

export function createAssetManifest(
  input: Omit<AssetManifest, 'version'> & { version?: 1 },
): AssetManifest {
  const entries = input.entries.map((entry) => Object.freeze({ ...entry }));
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.key)) {
      throw new Error(`Duplicate AssetKey in manifest: ${entry.key}`);
    }
    seen.add(entry.key);
    validateMetadata(entry);
    validateOwner(entry);
    validateKind(entry);
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    generatedAt: input.generatedAt,
    version: 1,
  });
}

export function indexAssetManifest(manifest: AssetManifest) {
  return new Map<string, AssetManifestEntry>(
    manifest.entries.map((entry) => [entry.key, entry]),
  );
}

function validateMetadata(entry: AssetManifestEntry) {
  if (!Number.isInteger(entry.width) || entry.width <= 0) {
    throw new Error(`Invalid width for ${entry.key}: ${entry.width}`);
  }
  if (!Number.isInteger(entry.height) || entry.height <= 0) {
    throw new Error(`Invalid height for ${entry.key}: ${entry.height}`);
  }
  if (
    entry.byteSize !== undefined &&
    (!Number.isInteger(entry.byteSize) || entry.byteSize < 0)
  ) {
    throw new Error(`Invalid byteSize for ${entry.key}: ${entry.byteSize}`);
  }
}

function validateOwner(entry: AssetManifestEntry) {
  const parsed = parseAssetKey(entry.key);
  if (parsed.ownerId && entry.ownerId !== parsed.ownerId) {
    throw new Error(
      `Asset owner mismatch for ${entry.key}: expected ${parsed.ownerId}, received ${entry.ownerId ?? 'undefined'}`,
    );
  }
  if (entry.ownerKind === 'profile' && !entry.ownerId?.startsWith('profile:')) {
    throw new Error(
      `Profile asset ${entry.key} requires a profile:... ownerId`,
    );
  }
  if (entry.ownerKind === 'set' && !entry.ownerId?.startsWith('set:')) {
    throw new Error(`Set asset ${entry.key} requires a set:... ownerId`);
  }
  if (entry.ownerKind === 'message' && !entry.ownerId?.startsWith('message:')) {
    throw new Error(
      `Message asset ${entry.key} requires a message:... ownerId`,
    );
  }
}

function validateKind(entry: AssetManifestEntry) {
  const parsed = parseAssetKey(entry.key);
  if (parsed.scope === 'profile') {
    const expected = parsed.slot.startsWith('avatar')
      ? 'avatar'
      : parsed.slot.startsWith('cover')
        ? 'cover'
        : parsed.slot.startsWith('wall')
          ? 'wall'
          : undefined;
    if (expected && entry.kind !== expected) {
      throw new Error(
        `Asset kind mismatch for ${entry.key}: expected ${expected}, received ${entry.kind}`,
      );
    }
  }
  if (parsed.scope === 'set' && entry.kind !== 'set-artwork') {
    throw new Error(
      `Asset kind mismatch for ${entry.key}: expected set-artwork, received ${entry.kind}`,
    );
  }
  if (parsed.scope === 'vibe' && entry.kind !== 'vibe-artwork') {
    throw new Error(
      `Asset kind mismatch for ${entry.key}: expected vibe-artwork, received ${entry.kind}`,
    );
  }
}
