import rawManifest from '../../../../assets/simulation/asset-manifest.v1.json';

import { createAssetKey, type AssetKey } from '../asset-key';
import { createAssetManifest } from '../asset-manifest';
import { createAssetResolver } from '../asset-resolver';
import type {
  AssetFormat,
  AssetKind,
  AssetManifestEntry,
} from '../asset-types';

const bundledModuleByKey = {
  'asset:v1/library/avatar/cozy-gamer':
    require('../../../../assets/simulation/golden-world/avatars/cozy-gamer.png') as number,
  'asset:v1/library/avatar/cyber-girl':
    require('../../../../assets/simulation/golden-world/avatars/cyber-girl.png') as number,
  'asset:v1/library/avatar/dark-fighter':
    require('../../../../assets/simulation/golden-world/avatars/dark-fighter.png') as number,
  'asset:v1/library/avatar/ice-prince':
    require('../../../../assets/simulation/golden-world/avatars/ice-prince.png') as number,
  'asset:v1/library/avatar/lavender-mage':
    require('../../../../assets/simulation/golden-world/avatars/lavender-mage.png') as number,
  'asset:v1/library/avatar/pink-carry':
    require('../../../../assets/simulation/golden-world/avatars/pink-carry.png') as number,
  'asset:v1/library/avatar/pink-support':
    require('../../../../assets/simulation/golden-world/avatars/pink-support.png') as number,
  'asset:v1/library/avatar/silver-assassin':
    require('../../../../assets/simulation/golden-world/avatars/silver-assassin.png') as number,
  'asset:v1/library/vibe/duo-support':
    require('../../../../assets/simulation/golden-world/artwork/vibe-duo-support.png') as number,
  'asset:v1/library/vibe/late-night-rank':
    require('../../../../assets/simulation/golden-world/artwork/vibe-late-night-rank.png') as number,
  'asset:v1/library/vibe/team-needs-mid':
    require('../../../../assets/simulation/golden-world/artwork/vibe-team-needs-mid.png') as number,
  'asset:v1/message/khoa-build-1/image/primary':
    require('../../../../assets/anh_mau2/heroes/nakroth.webp') as number,
  'asset:v1/profile/khoa-jungle/avatar':
    require('../../../../assets/simulation/golden-world/avatars/khoa-jungle.png') as number,
  'asset:v1/profile/minh-anh/avatar':
    require('../../../../assets/simulation/golden-world/avatars/minh-anh.png') as number,
  'asset:v1/set/duo-jungle-support/artwork':
    require('../../../../assets/simulation/golden-world/artwork/set-duo-jungle-support.png') as number,
  'asset:v1/set/team-sao-bang/artwork':
    require('../../../../assets/simulation/golden-world/artwork/set-team-sao-bang.png') as number,
} as const;

type RawManifestEntry = {
  byteSize: number;
  format: AssetFormat;
  height: number;
  key: string;
  kind: AssetKind;
  ownerId?: string;
  source: { path: string; type: 'bundled' };
  width: number;
};

const entries = (rawManifest.entries as RawManifestEntry[]).map(
  (entry): AssetManifestEntry => {
    const key = createAssetKey(entry.key);
    const module = bundledModuleByKey[key as keyof typeof bundledModuleByKey];
    if (module === undefined) {
      throw new Error(`Missing Metro module registration for ${key}`);
    }
    return {
      byteSize: entry.byteSize,
      format: entry.format,
      height: entry.height,
      key,
      kind: entry.kind,
      ownerId: entry.ownerId,
      source: { module, type: 'bundled' },
      width: entry.width,
    };
  },
);

export const goldenWorldAssetManifest = createAssetManifest({
  entries,
  generatedAt: rawManifest.generatedAt,
});

export const goldenWorldAssetResolver = createAssetResolver({
  manifest: goldenWorldAssetManifest,
});

export const goldenWorldAssetKeys = {
  library: {
    avatars: {
      cozyGamer: createAssetKey('asset:v1/library/avatar/cozy-gamer'),
      cyberGirl: createAssetKey('asset:v1/library/avatar/cyber-girl'),
      darkFighter: createAssetKey('asset:v1/library/avatar/dark-fighter'),
      icePrince: createAssetKey('asset:v1/library/avatar/ice-prince'),
      lavenderMage: createAssetKey('asset:v1/library/avatar/lavender-mage'),
      pinkCarry: createAssetKey('asset:v1/library/avatar/pink-carry'),
      pinkSupport: createAssetKey('asset:v1/library/avatar/pink-support'),
      silverAssassin: createAssetKey('asset:v1/library/avatar/silver-assassin'),
    },
    vibes: {
      duoSupport: createAssetKey('asset:v1/library/vibe/duo-support'),
      lateNightRank: createAssetKey('asset:v1/library/vibe/late-night-rank'),
      teamNeedsMid: createAssetKey('asset:v1/library/vibe/team-needs-mid'),
    },
  },
  messages: {
    khoaBuildPrimary: createAssetKey(
      'asset:v1/message/khoa-build-1/image/primary',
    ),
  },
  profiles: {
    khoaJungleAvatar: createAssetKey('asset:v1/profile/khoa-jungle/avatar'),
    minhAnhAvatar: createAssetKey('asset:v1/profile/minh-anh/avatar'),
  },
  sets: {
    duoJungleSupportArtwork: createAssetKey(
      'asset:v1/set/duo-jungle-support/artwork',
    ),
    teamSaoBangArtwork: createAssetKey('asset:v1/set/team-sao-bang/artwork'),
  },
} as const;

export const legacyAssetKeyAliases: Readonly<Record<string, AssetKey>> = {
  'avatar:black-fighter': goldenWorldAssetKeys.library.avatars.darkFighter,
  'avatar:blonde-mage': goldenWorldAssetKeys.library.avatars.lavenderMage,
  'avatar:cozy-gamer': goldenWorldAssetKeys.library.avatars.cozyGamer,
  'avatar:cyber-girl': goldenWorldAssetKeys.library.avatars.cyberGirl,
  'avatar:energetic-carry': goldenWorldAssetKeys.library.avatars.pinkCarry,
  'avatar:ice-prince': goldenWorldAssetKeys.library.avatars.icePrince,
  'avatar:pink-support': goldenWorldAssetKeys.library.avatars.pinkSupport,
  'avatar:silver-assassin': goldenWorldAssetKeys.library.avatars.silverAssassin,
  'avatar-cozy-gamer': goldenWorldAssetKeys.library.avatars.cozyGamer,
  'avatar-cyber-girl': goldenWorldAssetKeys.library.avatars.cyberGirl,
  'avatar-dark-fighter': goldenWorldAssetKeys.library.avatars.darkFighter,
  'avatar-ice-prince': goldenWorldAssetKeys.library.avatars.icePrince,
  'avatar-khoa-jungle': goldenWorldAssetKeys.profiles.khoaJungleAvatar,
  'avatar-lavender-mage': goldenWorldAssetKeys.library.avatars.lavenderMage,
  'avatar-minh-anh': goldenWorldAssetKeys.profiles.minhAnhAvatar,
  'avatar-pink-carry': goldenWorldAssetKeys.library.avatars.pinkCarry,
  'avatar-pink-support': goldenWorldAssetKeys.library.avatars.pinkSupport,
  'avatar-silver-assassin': goldenWorldAssetKeys.library.avatars.silverAssassin,
  'build:nakroth': goldenWorldAssetKeys.messages.khoaBuildPrimary,
  'set-duo-jungle-support': goldenWorldAssetKeys.sets.duoJungleSupportArtwork,
  'set-team-sao-bang': goldenWorldAssetKeys.sets.teamSaoBangArtwork,
  'team:sao-bang': goldenWorldAssetKeys.sets.teamSaoBangArtwork,
  'vibe-duo-support': goldenWorldAssetKeys.library.vibes.duoSupport,
  'vibe-late-night-rank': goldenWorldAssetKeys.library.vibes.lateNightRank,
  'vibe-team-needs-mid': goldenWorldAssetKeys.library.vibes.teamNeedsMid,
};

export function canonicalAssetKey(
  key: AssetKey | string,
): AssetKey | undefined {
  return typeof key === 'string' && key.startsWith('asset:v1/')
    ? createAssetKey(key)
    : legacyAssetKeyAliases[key];
}

export function resolveGoldenWorldAssetSource(key: AssetKey | string) {
  const canonical = canonicalAssetKey(key);
  return canonical
    ? goldenWorldAssetResolver.resolve(canonical).source
    : undefined;
}

export function requireGoldenWorldAssetSource(key: AssetKey | string) {
  const source = resolveGoldenWorldAssetSource(key);
  if (!source) throw new Error(`Unknown Golden World asset: ${key}`);
  return source;
}

export function requireGoldenWorldBundledModule(
  key: AssetKey | string,
): number {
  const canonical = canonicalAssetKey(key);
  const resolved = canonical
    ? goldenWorldAssetResolver.resolve(canonical)
    : undefined;
  if (resolved?.entry?.source.type !== 'bundled' || !resolved.source) {
    throw new Error(`Golden World asset is not bundled: ${key}`);
  }
  return resolved.source as number;
}
