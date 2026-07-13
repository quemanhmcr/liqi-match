import { describe, expect, it, jest } from '@jest/globals';

import { GOLDEN_WORLD, type AssetKey } from '@/entities/simulation';

import {
  assetPreloadSurfaces,
  goldenWorldAssetPreloadPlan,
  preloadGoldenWorldAssetSurface,
} from '../asset-preload-plan';
import type { AssetResolver } from '../asset-resolver';
import { goldenWorldAssetManifest } from '../data/golden-world-asset-manifest';

describe('golden world asset preload plan', () => {
  it('defines every public surface with unique, resolvable keys', () => {
    const manifestKeys = new Set(
      goldenWorldAssetManifest.entries.map((entry) => entry.key),
    );

    expect(Object.keys(goldenWorldAssetPreloadPlan).sort()).toEqual(
      [...assetPreloadSurfaces].sort(),
    );
    for (const keys of Object.values(goldenWorldAssetPreloadPlan)) {
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(manifestKeys.has(key)).toBe(true);
      }
    }
  });

  it('keeps base-world preload keys inside the canonical world manifest', () => {
    const worldKeys = new Set(Object.keys(GOLDEN_WORLD.assets));
    for (const keys of Object.values(goldenWorldAssetPreloadPlan)) {
      for (const key of keys) expect(worldKeys.has(key)).toBe(true);
    }
  });

  it('delegates preload without exposing manifest paths to consumers', async () => {
    const preload = jest.fn<(keys: readonly AssetKey[]) => Promise<void>>(
      async () => {},
    );
    const resolver = { preload } as Pick<
      AssetResolver,
      'preload'
    > as AssetResolver;

    await preloadGoldenWorldAssetSurface(resolver, 'home');

    expect(preload).toHaveBeenCalledWith(goldenWorldAssetPreloadPlan.home);
  });
});
