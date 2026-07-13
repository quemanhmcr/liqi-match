import { describe, expect, it } from '@jest/globals';

import rawManifest from '../../../../assets/simulation/asset-manifest.v1.json';

import {
  GOLDEN_ASSET_REQUIREMENTS,
  GOLDEN_WORLD,
  MEDIA_PARTIALLY_ASSOCIATED_SCENARIO,
  type AssetKey,
} from '@/entities/simulation';

import { createAssetKey } from '../asset-key';
import {
  canonicalAssetKey,
  goldenWorldAssetManifest,
  goldenWorldAssetResolver,
  legacyAssetKeyAliases,
  requireGoldenWorldAssetSource,
} from '../data/golden-world-asset-manifest';

describe('golden world asset manifest', () => {
  it('registers every validated physical metadata entry with Metro or a placeholder', () => {
    expect(goldenWorldAssetManifest.entries).toHaveLength(
      rawManifest.entries.length,
    );

    for (const entry of goldenWorldAssetManifest.entries) {
      const resolved = goldenWorldAssetResolver.resolve(entry.key);
      expect(resolved.key).toBe(entry.key);
      expect(resolved.entry).toBe(entry);
      if (entry.simulationState === 'unassociated') {
        expect(resolved.state).toBe('uploaded-but-unassociated');
        expect(resolved.source).toBeDefined();
      } else {
        expect(resolved.state).toBe('ready');
        if (entry.source.type === 'bundled') {
          expect(resolved.source).toBeDefined();
        }
      }
    }
  });

  it('covers every canonical base-world asset with matching kind, owner and state', () => {
    const physicalByKey = new Map(
      goldenWorldAssetManifest.entries.map((entry) => [entry.key, entry]),
    );

    for (const worldEntry of Object.values(GOLDEN_WORLD.assets)) {
      const physical = physicalByKey.get(worldEntry.key);
      expect(physical).toBeDefined();
      expect(physical).toMatchObject({
        key: worldEntry.key,
        kind: worldEntry.kind,
        ownerId: worldEntry.owner.id,
        ownerKind: worldEntry.owner.kind,
        simulationState: worldEntry.state,
        usage: 'golden-world',
      });
      expect(goldenWorldAssetResolver.resolve(worldEntry.key).state).toBe(
        worldEntry.state === 'available' ? 'ready' : worldEntry.state,
      );
    }
  });

  it('covers every profile, set and message requirement without fabricating null media', () => {
    const required = new Set<AssetKey>();
    for (const profile of Object.values(GOLDEN_ASSET_REQUIREMENTS.profiles)) {
      if (profile.avatar) required.add(profile.avatar);
      if (profile.cover) required.add(profile.cover);
      profile.wall.forEach((key) => required.add(key));
      profile.pending.forEach((key) => required.add(key));
    }
    for (const set of Object.values(GOLDEN_ASSET_REQUIREMENTS.sets)) {
      required.add(set.artwork);
    }
    for (const keys of Object.values(GOLDEN_ASSET_REQUIREMENTS.messages)) {
      keys.forEach((key) => required.add(key));
    }

    for (const key of required) {
      expect(goldenWorldAssetResolver.resolve(key).state).toBe('ready');
    }
    expect(
      Object.values(GOLDEN_ASSET_REQUIREMENTS.profiles).some(
        (profile) => profile.avatar === null,
      ),
    ).toBe(true);
  });

  it('ships the partially-associated scenario asset under the same stable key', () => {
    const key = createAssetKey('asset:profile:quan-viewer:cover-pending');
    const scenarioEntry =
      MEDIA_PARTIALLY_ASSOCIATED_SCENARIO.initialWorld.assets[key];

    expect(scenarioEntry).toMatchObject({ key, state: 'unassociated' });
    expect(goldenWorldAssetResolver.resolve(key)).toMatchObject({
      key,
      source: expect.anything(),
      state: 'uploaded-but-unassociated',
    });
  });

  it('keeps temporary feature aliases at the migration boundary only', () => {
    for (const [alias, expected] of Object.entries(legacyAssetKeyAliases)) {
      expect(canonicalAssetKey(alias)).toBe(expected);
      expect(requireGoldenWorldAssetSource(alias)).toBeDefined();
    }
  });
});
