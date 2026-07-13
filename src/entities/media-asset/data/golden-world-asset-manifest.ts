import rawManifest from '../../../../assets/simulation/asset-manifest.v1.json';

import {
  GOLDEN_ASSET_KEYS,
  GOLDEN_ASSET_REQUIREMENTS,
  GOLDEN_PROFILE_IDS,
  type AssetKey,
  type SimulatedAssetKind,
  type SimulatedAssetState,
} from '@/entities/simulation';

import { createAssetKey, isAssetKey } from '../asset-key';
import { createAssetManifest } from '../asset-manifest';
import { createAssetResolver } from '../asset-resolver';
import type {
  AssetFormat,
  AssetManifestEntry,
  AssetManifestUsage,
  AssetOwnerKind,
  AssetPlaceholderVariant,
} from '../asset-types';
import { bundledModuleByAssetKey } from './generated-bundled-modules';

type RawBundledSource = { path: string; type: 'bundled' };
type RawPlaceholderSource = {
  type: 'placeholder';
  variant: AssetPlaceholderVariant;
};
type RawManifestEntry = {
  altText?: string;
  byteSize?: number;
  format: AssetFormat;
  height: number;
  key: string;
  kind: SimulatedAssetKind;
  ownerId?: string;
  ownerKind?: AssetOwnerKind;
  simulationState?: SimulatedAssetState;
  source: RawBundledSource | RawPlaceholderSource;
  usage?: AssetManifestUsage;
  width: number;
};

const entries = (rawManifest.entries as RawManifestEntry[]).map(
  (entry): AssetManifestEntry => {
    const key = createAssetKey(entry.key);
    const source =
      entry.source.type === 'placeholder'
        ? entry.source
        : {
            module:
              bundledModuleByAssetKey[
                key as keyof typeof bundledModuleByAssetKey
              ] ?? missingMetroModule(key),
            type: 'bundled' as const,
          };
    return {
      altText: entry.altText,
      byteSize: entry.byteSize,
      format: entry.format,
      height: entry.height,
      key,
      kind: entry.kind,
      ownerId: entry.ownerId,
      ownerKind: entry.ownerKind,
      simulationState: entry.simulationState,
      source,
      usage: entry.usage,
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

const profileAvatar = (
  profileId: keyof typeof GOLDEN_ASSET_REQUIREMENTS.profiles,
) => {
  const profile = GOLDEN_ASSET_REQUIREMENTS.profiles[profileId];
  if (!profile) {
    throw new Error(`Unknown Golden World profile requirement: ${profileId}`);
  }
  const key = profile.avatar;
  if (!key) {
    throw new Error(`Golden profile has no avatar requirement: ${profileId}`);
  }
  return key;
};

export const goldenWorldAssetKeys = {
  legacy: {
    buildNakroth: createAssetKey('asset:shared:legacy-build-nakroth'),
    roleJungle: createAssetKey('asset:shared:legacy-role-jungle'),
  },
  library: {
    avatars: {
      cozyGamer: profileAvatar(GOLDEN_PROFILE_IDS.quanViewer),
      cyberGirl: profileAvatar(GOLDEN_PROFILE_IDS.linhMid),
      darkFighter: profileAvatar(GOLDEN_PROFILE_IDS.huyCaptain),
      icePrince: profileAvatar(GOLDEN_PROFILE_IDS.namSlayer),
      lavenderMage: profileAvatar(GOLDEN_PROFILE_IDS.anMage),
      pinkCarry: profileAvatar(GOLDEN_PROFILE_IDS.vyCarry),
      pinkSupport: profileAvatar(GOLDEN_PROFILE_IDS.trangCarry),
      silverAssassin: profileAvatar(GOLDEN_PROFILE_IDS.ducFlex),
    },
  },
  messages: {
    buildAya: GOLDEN_ASSET_KEYS.buildAya,
    khoaBuildPrimary: createAssetKey('asset:shared:legacy-build-nakroth'),
    lobby: GOLDEN_ASSET_KEYS.messageLobby,
    victory: GOLDEN_ASSET_KEYS.messageVictory,
  },
  profiles: {
    anMageAvatar: profileAvatar(GOLDEN_PROFILE_IDS.anMage),
    ducFlexAvatar: profileAvatar(GOLDEN_PROFILE_IDS.ducFlex),
    huyCaptainAvatar: profileAvatar(GOLDEN_PROFILE_IDS.huyCaptain),
    khoaJungleAvatar: profileAvatar(GOLDEN_PROFILE_IDS.khoaJungle),
    linhMidAvatar: profileAvatar(GOLDEN_PROFILE_IDS.linhMid),
    minhAnhAvatar: profileAvatar(GOLDEN_PROFILE_IDS.minhAnh),
    namSlayerAvatar: profileAvatar(GOLDEN_PROFILE_IDS.namSlayer),
    phucJungleAvatar: profileAvatar(GOLDEN_PROFILE_IDS.phucJungle),
    quanViewerAvatar: profileAvatar(GOLDEN_PROFILE_IDS.quanViewer),
    trangCarryAvatar: profileAvatar(GOLDEN_PROFILE_IDS.trangCarry),
    vyCarryAvatar: profileAvatar(GOLDEN_PROFILE_IDS.vyCarry),
  },
  scenario: {
    quanPendingCover: createAssetKey('asset:profile:quan-viewer:cover-pending'),
  },
  sets: {
    demVioletArtwork: GOLDEN_ASSET_KEYS.setDemViolet,
    duoJungleSupportArtwork: GOLDEN_ASSET_KEYS.setMacroLab,
    macroLabArtwork: GOLDEN_ASSET_KEYS.setMacroLab,
    saoBangArtwork: GOLDEN_ASSET_KEYS.setSaoBang,
    teamSaoBangArtwork: GOLDEN_ASSET_KEYS.setSaoBang,
  },
  shared: {
    avatarFallback: GOLDEN_ASSET_KEYS.avatarFallback,
    roleSupport: GOLDEN_ASSET_KEYS.roleSupport,
  },
  vibes: {
    duoSupport: GOLDEN_ASSET_KEYS.vibeSocial,
    lateNightRank: GOLDEN_ASSET_KEYS.vibeRank,
    rank: GOLDEN_ASSET_KEYS.vibeRank,
    social: GOLDEN_ASSET_KEYS.vibeSocial,
    team: GOLDEN_ASSET_KEYS.vibeTeam,
    teamNeedsMid: GOLDEN_ASSET_KEYS.vibeTeam,
  },
} as const;

export const legacyAssetKeyAliases: Readonly<Record<string, AssetKey>> = {
  'asset:v1/library/avatar/cozy-gamer':
    goldenWorldAssetKeys.profiles.quanViewerAvatar,
  'asset:v1/library/avatar/cyber-girl':
    goldenWorldAssetKeys.profiles.linhMidAvatar,
  'asset:v1/library/avatar/dark-fighter':
    goldenWorldAssetKeys.profiles.huyCaptainAvatar,
  'asset:v1/library/avatar/ice-prince':
    goldenWorldAssetKeys.profiles.namSlayerAvatar,
  'asset:v1/library/avatar/lavender-mage':
    goldenWorldAssetKeys.profiles.anMageAvatar,
  'asset:v1/library/avatar/pink-carry':
    goldenWorldAssetKeys.profiles.vyCarryAvatar,
  'asset:v1/library/avatar/pink-support':
    goldenWorldAssetKeys.profiles.trangCarryAvatar,
  'asset:v1/library/avatar/silver-assassin':
    goldenWorldAssetKeys.profiles.ducFlexAvatar,
  'asset:v1/message/khoa-build-1/image/primary':
    goldenWorldAssetKeys.legacy.buildNakroth,
  'asset:v1/profile/khoa-jungle/avatar':
    goldenWorldAssetKeys.profiles.khoaJungleAvatar,
  'asset:v1/profile/minh-anh/avatar':
    goldenWorldAssetKeys.profiles.minhAnhAvatar,
  'asset:v1/set/duo-jungle-support/artwork':
    goldenWorldAssetKeys.sets.macroLabArtwork,
  'asset:v1/set/team-sao-bang/artwork':
    goldenWorldAssetKeys.sets.saoBangArtwork,
  'avatar:black-fighter': goldenWorldAssetKeys.profiles.huyCaptainAvatar,
  'avatar:blonde-mage': goldenWorldAssetKeys.profiles.anMageAvatar,
  'avatar:cozy-gamer': goldenWorldAssetKeys.profiles.quanViewerAvatar,
  'avatar:cyber-girl': goldenWorldAssetKeys.profiles.linhMidAvatar,
  'avatar:energetic-carry': goldenWorldAssetKeys.profiles.vyCarryAvatar,
  'avatar:ice-prince': goldenWorldAssetKeys.profiles.namSlayerAvatar,
  'avatar:pink-support': goldenWorldAssetKeys.profiles.trangCarryAvatar,
  'avatar:silver-assassin': goldenWorldAssetKeys.profiles.ducFlexAvatar,
  'avatar-cozy-gamer': goldenWorldAssetKeys.profiles.quanViewerAvatar,
  'avatar-cyber-girl': goldenWorldAssetKeys.profiles.linhMidAvatar,
  'avatar-dark-fighter': goldenWorldAssetKeys.profiles.huyCaptainAvatar,
  'avatar-ice-prince': goldenWorldAssetKeys.profiles.namSlayerAvatar,
  'avatar-khoa-jungle': goldenWorldAssetKeys.profiles.khoaJungleAvatar,
  'avatar-lavender-mage': goldenWorldAssetKeys.profiles.anMageAvatar,
  'avatar-minh-anh': goldenWorldAssetKeys.profiles.minhAnhAvatar,
  'avatar-pink-carry': goldenWorldAssetKeys.profiles.vyCarryAvatar,
  'avatar-pink-support': goldenWorldAssetKeys.profiles.trangCarryAvatar,
  'avatar-silver-assassin': goldenWorldAssetKeys.profiles.ducFlexAvatar,
  'build:nakroth': goldenWorldAssetKeys.legacy.buildNakroth,
  'role:jungle': goldenWorldAssetKeys.legacy.roleJungle,
  'set-duo-jungle-support': goldenWorldAssetKeys.sets.macroLabArtwork,
  'set-team-sao-bang': goldenWorldAssetKeys.sets.saoBangArtwork,
  'team:sao-bang': goldenWorldAssetKeys.sets.saoBangArtwork,
  'vibe-duo-support': goldenWorldAssetKeys.vibes.social,
  'vibe-late-night-rank': goldenWorldAssetKeys.vibes.rank,
  'vibe-team-needs-mid': goldenWorldAssetKeys.vibes.team,
};

export function canonicalAssetKey(
  key: AssetKey | string,
): AssetKey | undefined {
  return (
    legacyAssetKeyAliases[key] ??
    (isAssetKey(key) ? createAssetKey(key) : undefined)
  );
}

export function resolveGoldenWorldAssetSource(key: AssetKey | string) {
  const canonical = canonicalAssetKey(key);
  return canonical
    ? goldenWorldAssetResolver.resolve(canonical).source
    : undefined;
}

export function requireGoldenWorldAssetSource(key: AssetKey | string) {
  const source = resolveGoldenWorldAssetSource(key);
  if (!source)
    throw new Error(`Unknown or unavailable Golden World asset: ${key}`);
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

function missingMetroModule(key: AssetKey): never {
  throw new Error(`Missing Metro module registration for ${key}`);
}
