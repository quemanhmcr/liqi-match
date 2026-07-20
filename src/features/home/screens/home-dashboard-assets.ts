import type { ImageSourcePropType } from 'react-native';

// Metro requires static string literals for bundled images. Keep this registry
// next to the Home presentation layer so visual ownership stays explicit.
export const homeDashboardAssets = {
  activityCarry:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_hoat_dong_ganh_team_1064x1478.png') as ImageSourcePropType,
  activityChill:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_hoat_dong_chill_cung_nhau_1064x1478.png') as ImageSourcePropType,
  activityStreak:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_hoat_dong_chuoi_4_win_1064x1478.png') as ImageSourcePropType,
  activityVictory:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_hoat_dong_chien_thang_1064x1478.png') as ImageSourcePropType,
  avatarFemale:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/avatar_ui_nu_tri_ki_1254x1254.png') as ImageSourcePropType,
  avatarMale:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/avatar_ui_nam_tri_ki_1254x1254.png') as ImageSourcePropType,
  hero: require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_tim_tri_ki_hero_1536x1024.png') as ImageSourcePropType,
  room: require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_phong_cua_ban_1391x1131.png') as ImageSourcePropType,
  upcomingSession:
    require('../../../../assets/new_ui/liqi_ui_backgrounds_and_avatars/background_ui_buoi_choi_sap_toi_1391x1131.png') as ImageSourcePropType,
} as const;
