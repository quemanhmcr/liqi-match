import { describe, expect, it } from '@jest/globals';

import { createAssetKey } from '../asset-key';
import { createAssetManifest } from '../asset-manifest';
import type { AssetManifestEntry } from '../asset-types';

const avatar: AssetManifestEntry = {
  format: 'png',
  height: 512,
  key: createAssetKey('asset:v1/profile/minh-anh/avatar'),
  kind: 'avatar',
  ownerId: 'minh-anh',
  source: { module: 1, type: 'bundled' },
  width: 512,
};

describe('createAssetManifest', () => {
  it('freezes a valid versioned manifest', () => {
    const manifest = createAssetManifest({
      entries: [avatar],
      generatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(manifest.version).toBe(1);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
  });

  it('rejects duplicate keys', () => {
    expect(() =>
      createAssetManifest({
        entries: [avatar, avatar],
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Duplicate AssetKey');
  });

  it('rejects owner drift between key and metadata', () => {
    expect(() =>
      createAssetManifest({
        entries: [{ ...avatar, ownerId: 'another-profile' }],
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Asset owner mismatch');
  });
});
