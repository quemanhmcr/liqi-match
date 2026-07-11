import type { ImageSourcePropType } from 'react-native';

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

export type NotificationCategory =
  'interaction' | 'message' | 'set-invite' | 'system';

export type NotificationTone = 'blue' | 'cyan' | 'pink' | 'purple';

export type NotificationAction = {
  label: string;
  tone: Extract<NotificationTone, 'blue' | 'pink' | 'purple'>;
};

export type NotificationVisual =
  | {
      badgeIcon?: string;
      kind: 'avatar';
      source: ImageSourcePropType;
      tone: NotificationTone;
    }
  | {
      icon: string;
      kind: 'symbol';
      tone: NotificationTone;
    };

export type NotificationReward = {
  icon: string;
  label: string;
  tone: NotificationTone;
};

export type NotificationItem = {
  action?: NotificationAction;
  category: NotificationCategory;
  group: 'Hôm nay' | 'Trước đó';
  id: string;
  isRead: boolean;
  messageParts: readonly string[];
  previewAvatars?: readonly ImageSourcePropType[];
  reward?: NotificationReward;
  timeLabel: string;
  title: string;
  visual: NotificationVisual;
};

export const notificationFilters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'set-invite', label: 'Mời set' },
  { id: 'system', label: 'Hệ thống' },
  { id: 'interaction', label: 'Tương tác' },
] as const;

export type NotificationFilterId = (typeof notificationFilters)[number]['id'];

export const notificationMockItems: readonly NotificationItem[] = [
  {
    action: { label: 'Xem set', tone: 'pink' },
    category: 'set-invite',
    group: 'Hôm nay',
    id: 'invite-team-sao-bang',
    isRead: false,
    messageParts: ['đã mời bạn vào set', '“Team Sao Băng”'],
    timeLabel: '2 phút trước',
    title: 'Minh Anh',
    visual: {
      badgeIcon: 'sparkles-outline',
      kind: 'avatar',
      source: avatarMinhAnh,
      tone: 'purple',
    },
  },
  {
    action: { label: 'Trả lời', tone: 'blue' },
    category: 'message',
    group: 'Hôm nay',
    id: 'message-khoa-jungle',
    isRead: false,
    messageParts: ['đã nhắn cho bạn', '“Đang thiếu Mid, vào không?”'],
    timeLabel: '12 phút trước',
    title: 'Khoa Jungle',
    visual: {
      badgeIcon: 'chatbubble-ellipses-outline',
      kind: 'avatar',
      source: avatarKhoaJungle,
      tone: 'blue',
    },
  },
  {
    category: 'interaction',
    group: 'Hôm nay',
    id: 'praise-teammates',
    isRead: false,
    messageParts: ['Bạn nhận được 2 lời khen mới', 'từ đồng đội'],
    previewAvatars: [avatarMinhAnh, avatarTeammateOne, avatarTeammateTwo],
    timeLabel: '35 phút trước',
    title: '',
    visual: { icon: 'heart-outline', kind: 'symbol', tone: 'purple' },
  },
  {
    action: { label: 'Tham gia', tone: 'purple' },
    category: 'set-invite',
    group: 'Hôm nay',
    id: 'team-rank-starting',
    isRead: true,
    messageParts: ['tối nay bắt đầu', 'lúc 20:00'],
    timeLabel: '1 giờ trước',
    title: 'Team Rank',
    visual: { icon: 'trophy-outline', kind: 'symbol', tone: 'purple' },
  },
  {
    category: 'interaction',
    group: 'Hôm nay',
    id: 'aya-liked-profile',
    isRead: true,
    messageParts: ['vừa thích hồ sơ của bạn'],
    reward: { icon: 'heart', label: '', tone: 'pink' },
    timeLabel: '2 giờ trước',
    title: 'Aya Only',
    visual: {
      kind: 'avatar',
      source: avatarAya,
      tone: 'pink',
    },
  },
  {
    category: 'system',
    group: 'Trước đó',
    id: 'weekly-mission-reward',
    isRead: true,
    messageParts: ['Bạn nhận thưởng nhiệm vụ tuần'],
    reward: { icon: 'diamond-outline', label: 'x50', tone: 'purple' },
    timeLabel: 'Hôm qua',
    title: 'Hệ thống:',
    visual: { icon: 'notifications-outline', kind: 'symbol', tone: 'blue' },
  },
  {
    category: 'system',
    group: 'Trước đó',
    id: 'reputation-updated',
    isRead: true,
    messageParts: ['Uy tín của bạn đã tăng lên 98'],
    reward: { icon: 'shield-checkmark-outline', label: '98', tone: 'cyan' },
    timeLabel: 'Hôm qua',
    title: 'Hệ thống:',
    visual: { icon: 'shield-checkmark-outline', kind: 'symbol', tone: 'cyan' },
  },
] as const;
