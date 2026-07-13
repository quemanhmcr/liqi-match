import { parseAssetKey } from './asset-key';
import type { AssetManifest, AssetManifestEntry } from './asset-types';

export function createAssetManifest(
  input: Omit<AssetManifest, 'version'> & { version?: 1 },
): AssetManifest {
  const entries = [...input.entries];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.key)) {
      throw new Error(`Duplicate AssetKey in manifest: ${entry.key}`);
    }
    seen.add(entry.key);

    const parsed = parseAssetKey(entry.key);
    if (parsed.ownerId && entry.ownerId !== parsed.ownerId) {
      throw new Error(
        `Asset owner mismatch for ${entry.key}: expected ${parsed.ownerId}, received ${entry.ownerId ?? 'undefined'}`,
      );
    }
    if (!parsed.ownerId && entry.ownerId) {
      throw new Error(`Library asset ${entry.key} must not declare ownerId`);
    }
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
