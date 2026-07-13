import {
  GOLDEN_ASSET_KEYS,
  GOLDEN_ASSET_REQUIREMENTS,
  GOLDEN_PROFILE_IDS,
  GOLDEN_SET_IDS,
  type AssetKey,
} from '@/entities/simulation';

import type { AssetResolver } from './asset-resolver';

export const assetPreloadSurfaces = [
  'app-shell',
  'discover',
  'home',
  'messages',
  'notifications',
  'profile',
] as const;

export type AssetPreloadSurface = (typeof assetPreloadSurfaces)[number];

const requiredProfileAsset = (
  profileId: keyof typeof GOLDEN_ASSET_REQUIREMENTS.profiles,
  slot: 'avatar' | 'cover',
) => {
  const key = GOLDEN_ASSET_REQUIREMENTS.profiles[profileId]?.[slot];
  if (!key) {
    throw new Error(`Missing ${slot} preload requirement for ${profileId}`);
  }
  return key;
};

const requiredSetArtwork = (
  setId: keyof typeof GOLDEN_ASSET_REQUIREMENTS.sets,
) => {
  const set = GOLDEN_ASSET_REQUIREMENTS.sets[setId];
  if (!set) throw new Error(`Missing set preload requirement for ${setId}`);
  return set.artwork;
};

const requiredProfileWall = (
  profileId: keyof typeof GOLDEN_ASSET_REQUIREMENTS.profiles,
) => {
  const profile = GOLDEN_ASSET_REQUIREMENTS.profiles[profileId];
  if (!profile) {
    throw new Error(`Missing profile preload requirement for ${profileId}`);
  }
  return profile.wall;
};

const allProfileAvatars = Object.values(GOLDEN_ASSET_REQUIREMENTS.profiles)
  .map((profile) => profile.avatar)
  .filter((key): key is AssetKey => key !== null);
const allSetArtwork = Object.values(GOLDEN_ASSET_REQUIREMENTS.sets).map(
  (set) => set.artwork,
);
const allMessageMedia = Object.values(
  GOLDEN_ASSET_REQUIREMENTS.messages,
).flat();

export const goldenWorldAssetPreloadPlan = Object.freeze({
  'app-shell': Object.freeze([GOLDEN_ASSET_KEYS.avatarFallback]),
  discover: unique([
    ...allProfileAvatars,
    ...allSetArtwork,
    GOLDEN_ASSET_KEYS.vibeRank,
    GOLDEN_ASSET_KEYS.vibeSocial,
    GOLDEN_ASSET_KEYS.vibeTeam,
  ]),
  home: unique([
    requiredProfileAsset(GOLDEN_PROFILE_IDS.quanViewer, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.quanViewer, 'cover'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.minhAnh, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.khoaJungle, 'avatar'),
    requiredSetArtwork(GOLDEN_SET_IDS.saoBang),
  ]),
  messages: unique([
    requiredProfileAsset(GOLDEN_PROFILE_IDS.minhAnh, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.khoaJungle, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.huyCaptain, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.anMage, 'avatar'),
    ...allMessageMedia,
    requiredSetArtwork(GOLDEN_SET_IDS.saoBang),
  ]),
  notifications: unique([
    requiredProfileAsset(GOLDEN_PROFILE_IDS.minhAnh, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.khoaJungle, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.linhMid, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.vyCarry, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.trangCarry, 'avatar'),
  ]),
  profile: unique([
    requiredProfileAsset(GOLDEN_PROFILE_IDS.quanViewer, 'avatar'),
    requiredProfileAsset(GOLDEN_PROFILE_IDS.quanViewer, 'cover'),
    ...requiredProfileWall(GOLDEN_PROFILE_IDS.quanViewer),
  ]),
} satisfies Readonly<Record<AssetPreloadSurface, readonly AssetKey[]>>);

export function preloadGoldenWorldAssetSurface(
  resolver: AssetResolver,
  surface: AssetPreloadSurface,
) {
  return resolver.preload(goldenWorldAssetPreloadPlan[surface]);
}

function unique(keys: readonly AssetKey[]) {
  return Object.freeze([...new Set(keys)]);
}
