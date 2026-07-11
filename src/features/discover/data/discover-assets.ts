import type { ImageSourcePropType } from 'react-native';

export const discoverAssetRegistry = {
  'avatar-cozy-gamer':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/08_avatar_cozy_gamer_girl.png') as ImageSourcePropType,
  'avatar-cyber-girl':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/05_avatar_purple_cyber_girl.png') as ImageSourcePropType,
  'avatar-dark-fighter':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/04_avatar_black_haired_dark_fighter.png') as ImageSourcePropType,
  'avatar-ice-prince':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/07_avatar_ice_prince.png') as ImageSourcePropType,
  'avatar-khoa-jungle':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/10_avatar_khoa_jungle.png') as ImageSourcePropType,
  'avatar-lavender-mage':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/03_avatar_blonde_lavender_mage.png') as ImageSourcePropType,
  'avatar-minh-anh':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/09_avatar_minh_anh.png') as ImageSourcePropType,
  'avatar-pink-carry':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/06_avatar_energetic_pink_carry.png') as ImageSourcePropType,
  'avatar-pink-support':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/01_avatar_pink_support_mage.png') as ImageSourcePropType,
  'avatar-silver-assassin':
    require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/02_avatar_silver_mask_assassin.png') as ImageSourcePropType,
  'set-duo-jungle-support':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/08_bg_duo_rung_tro_thu.png') as ImageSourcePropType,
  'set-team-sao-bang':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/07_emblem_team_sao_bang.png') as ImageSourcePropType,
  'vibe-duo-support':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/02_vibe_bg_duo_support.png') as ImageSourcePropType,
  'vibe-late-night-rank':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/01_vibe_bg_leo_rank_dem.png') as ImageSourcePropType,
  'vibe-team-needs-mid':
    require('../../../../assets/anh_mau_kham_pha/extracted_pack01/discover_generated_background_assets/03_vibe_bg_team_thieu_mid.png') as ImageSourcePropType,
} as const;

export type DiscoverAssetKey = keyof typeof discoverAssetRegistry;

export function resolveDiscoverAsset(assetKey: string): ImageSourcePropType {
  const source = discoverAssetRegistry[assetKey as DiscoverAssetKey];
  if (!source) throw new Error(`Unknown Discover fixture asset: ${assetKey}`);
  return source;
}
