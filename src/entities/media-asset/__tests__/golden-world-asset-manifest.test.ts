import { describe, expect, it } from '@jest/globals';

import rawManifest from '../../../../assets/simulation/asset-manifest.v1.json';

import {
  canonicalAssetKey,
  goldenWorldAssetKeys,
  goldenWorldAssetManifest,
  goldenWorldAssetResolver,
  legacyAssetKeyAliases,
  requireGoldenWorldAssetSource,
} from '../data/golden-world-asset-manifest';

describe('golden world asset manifest', () => {
  it('registers every validated metadata entry with Metro', () => {
    expect(goldenWorldAssetManifest.entries).toHaveLength(
      rawManifest.entries.length,
    );

    for (const entry of goldenWorldAssetManifest.entries) {
      expect(goldenWorldAssetResolver.resolve(entry.key)).toMatchObject({
        key: entry.key,
        state: 'ready',
      });
      expect(goldenWorldAssetResolver.resolve(entry.key).source).toBeDefined();
    }
  });

  it('keeps canonical profile media identical across legacy feature aliases', () => {
    expect(requireGoldenWorldAssetSource('avatar-minh-anh')).toBe(
      requireGoldenWorldAssetSource(
        goldenWorldAssetKeys.profiles.minhAnhAvatar,
      ),
    );
    expect(requireGoldenWorldAssetSource('avatar-khoa-jungle')).toBe(
      requireGoldenWorldAssetSource(
        goldenWorldAssetKeys.profiles.khoaJungleAvatar,
      ),
    );
  });

  it('keeps the same set artwork across Discover and Messages aliases', () => {
    expect(requireGoldenWorldAssetSource('set-team-sao-bang')).toBe(
      requireGoldenWorldAssetSource('team:sao-bang'),
    );
  });

  it('resolves every temporary migration alias to a canonical v1 key', () => {
    for (const [alias, expected] of Object.entries(legacyAssetKeyAliases)) {
      expect(canonicalAssetKey(alias)).toBe(expected);
      expect(requireGoldenWorldAssetSource(alias)).toBeDefined();
    }
  });
});
