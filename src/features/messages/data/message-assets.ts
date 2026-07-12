import { Image, type ImageSourcePropType } from 'react-native';

import type { MessageAssetRef } from '../contracts/messages-contracts';

export const messageFixtureAssets = {
  'avatar:black-fighter':
    require('../../../../assets/features/messages/avatars/04_avatar_black_haired_dark_fighter.png') as ImageSourcePropType,
  'avatar:blonde-mage':
    require('../../../../assets/features/messages/avatars/03_avatar_blonde_lavender_mage.png') as ImageSourcePropType,
  'avatar:cozy-gamer':
    require('../../../../assets/features/messages/avatars/08_avatar_cozy_gamer_girl.png') as ImageSourcePropType,
  'avatar:cyber-girl':
    require('../../../../assets/features/messages/avatars/05_avatar_purple_cyber_girl.png') as ImageSourcePropType,
  'avatar:energetic-carry':
    require('../../../../assets/features/messages/avatars/06_avatar_energetic_pink_carry.png') as ImageSourcePropType,
  'avatar:ice-prince':
    require('../../../../assets/features/messages/avatars/07_avatar_ice_prince.png') as ImageSourcePropType,
  'avatar:pink-support':
    require('../../../../assets/features/messages/avatars/01_avatar_pink_support_mage.png') as ImageSourcePropType,
  'avatar:silver-assassin':
    require('../../../../assets/features/messages/avatars/02_avatar_silver_mask_assassin.png') as ImageSourcePropType,
  'build:nakroth':
    require('../../../../assets/anh_mau2/heroes/nakroth.webp') as ImageSourcePropType,
  'role:jungle':
    require('../../../../assets/anh_mau2/lane-icons/jungle.png') as ImageSourcePropType,
  'team:sao-bang':
    require('../../../../assets/anh_mau_3/avatar_team_sao_bang_emblem.png') as ImageSourcePropType,
} as const;

export type MessageFixtureAssetKey = keyof typeof messageFixtureAssets;

export function resolveMessageAsset(
  asset: MessageAssetRef | undefined,
): ImageSourcePropType | undefined {
  if (!asset) return undefined;
  if (asset.kind === 'remote') return { uri: asset.url };
  return messageFixtureAssets[asset.assetKey as MessageFixtureAssetKey];
}

export function resolveMessageAssetUri(asset: MessageAssetRef) {
  if (asset.kind === 'remote') return asset.url;
  const source = resolveMessageAsset(asset);
  return source ? Image.resolveAssetSource(source)?.uri : undefined;
}
