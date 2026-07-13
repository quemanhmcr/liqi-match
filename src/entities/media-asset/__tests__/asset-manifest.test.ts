import { describe, expect, it } from '@jest/globals';

import { createAssetKey } from '../asset-key';
import { createAssetManifest } from '../asset-manifest';
import type { AssetManifestEntry } from '../asset-types';

const avatar: AssetManifestEntry = {
  format: 'png',
  height: 512,
  key: createAssetKey('asset:profile:minh-anh:avatar'),
  kind: 'avatar',
  ownerId: 'profile:minh-anh',
  ownerKind: 'profile',
  simulationState: 'available',
  source: { module: 1, type: 'bundled' },
  usage: 'golden-world',
  width: 512,
};

describe('createAssetManifest', () => {
  it('freezes a valid versioned manifest and its entries', () => {
    const manifest = createAssetManifest({
      entries: [avatar],
      generatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(manifest.version).toBe(1);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
    expect(Object.isFrozen(manifest.entries[0])).toBe(true);
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
        entries: [{ ...avatar, ownerId: 'profile:another-profile' }],
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Asset owner mismatch');
  });

  it('rejects kind drift between key and metadata', () => {
    expect(() =>
      createAssetManifest({
        entries: [{ ...avatar, kind: 'cover' }],
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Asset kind mismatch');
  });
});
