import type { ImageSourcePropType } from 'react-native';

import type { NotificationActor } from '@/entities/notifications';

const avatarMinhAnh =
  require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/03_avatar_blonde_lavender_mage.png') as ImageSourcePropType;
const avatarKhoaJungle =
  require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/02_avatar_silver_mask_assassin.png') as ImageSourcePropType;
const avatarTeammateOne =
  require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/05_avatar_purple_cyber_girl.png') as ImageSourcePropType;
const avatarTeammateTwo =
  require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/06_avatar_energetic_pink_carry.png') as ImageSourcePropType;
const avatarAya =
  require('../../../../assets/anh_mau_kham_pha/extra_avatars_pack02/01_avatar_pink_support_mage.png') as ImageSourcePropType;

const mockAvatarByActorId: Record<string, ImageSourcePropType> = {
  'profile-aya-only': avatarAya,
  'profile-khoa-jungle': avatarKhoaJungle,
  'profile-linh-mid': avatarTeammateOne,
  'profile-minh-anh': avatarMinhAnh,
  'profile-vy-carry': avatarTeammateTwo,
};

export const notificationFilters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'set-invite', label: 'Mời set' },
  { id: 'system', label: 'Hệ thống' },
  { id: 'interaction', label: 'Tương tác' },
] as const;

export type NotificationFilterId = (typeof notificationFilters)[number]['id'];

export function notificationActorImageSource(
  actor: NotificationActor,
): ImageSourcePropType | undefined {
  if (actor.avatarUrl) return { uri: actor.avatarUrl };
  return mockAvatarByActorId[actor.id];
}
