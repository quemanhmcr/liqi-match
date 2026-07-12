import type { ImageSourcePropType } from 'react-native';

import type { ChatMessage, ChatThread } from '../model/chat-message';

function fixtureTimestamp(hour: number, minute: number, dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const buildAssets = {
  jungleIcon:
    require('../../../../assets/anh_mau2/lane-icons/jungle.png') as ImageSourcePropType,
  nakroth:
    require('../../../../assets/anh_mau2/heroes/nakroth.webp') as ImageSourcePropType,
};

const avatars = {
  blackFighter:
    require('../../../../assets/features/messages/avatars/04_avatar_black_haired_dark_fighter.png') as ImageSourcePropType,
  blondeMage:
    require('../../../../assets/features/messages/avatars/03_avatar_blonde_lavender_mage.png') as ImageSourcePropType,
  cozyGamer:
    require('../../../../assets/features/messages/avatars/08_avatar_cozy_gamer_girl.png') as ImageSourcePropType,
  cyberGirl:
    require('../../../../assets/features/messages/avatars/05_avatar_purple_cyber_girl.png') as ImageSourcePropType,
  energeticCarry:
    require('../../../../assets/features/messages/avatars/06_avatar_energetic_pink_carry.png') as ImageSourcePropType,
  icePrince:
    require('../../../../assets/features/messages/avatars/07_avatar_ice_prince.png') as ImageSourcePropType,
  pinkSupport:
    require('../../../../assets/features/messages/avatars/01_avatar_pink_support_mage.png') as ImageSourcePropType,
  silverAssassin:
    require('../../../../assets/features/messages/avatars/02_avatar_silver_mask_assassin.png') as ImageSourcePropType,
};

const minhAnhMessages: readonly ChatMessage[] = [
  {
    direction: 'incoming',
    id: 'minh-1',
    kind: 'text',
    text: 'Tối nay rảnh không? Mình leo rank nha ✨',
    createdAt: fixtureTimestamp(17, 10),
  },
  {
    direction: 'outgoing',
    id: 'minh-2',
    kind: 'text',
    deliveryStatus: 'read',
    text: 'Được đó, tầm 8h mình online.',
    createdAt: fixtureTimestamp(17, 11),
  },
  {
    direction: 'incoming',
    id: 'minh-3',
    kind: 'text',
    text: 'Perfect. Team mình đang thiếu Mid, vào luôn không?',
    createdAt: fixtureTimestamp(17, 11),
  },
  {
    direction: 'outgoing',
    id: 'minh-4',
    kind: 'text',
    deliveryStatus: 'read',
    text: 'Cho mình xem set trước nhé.',
    createdAt: fixtureTimestamp(20, 32),
  },
  {
    direction: 'incoming',
    id: 'minh-5',
    kind: 'team-invite',
    members: ['Yue', 'Lorian'],
    missingRole: 'Mid',
    mode: 'Team Rank',
    teamName: 'Team Sao Băng',
    teamSize: '4/5',
    text: 'Mình mời bạn vào lobby',
    createdAt: fixtureTimestamp(20, 32),
  },
  {
    direction: 'outgoing',
    id: 'minh-6',
    kind: 'text',
    deliveryStatus: 'read',
    text: 'Set ổn đó, vào luôn nhé!',
    createdAt: fixtureTimestamp(20, 33),
  },
  {
    direction: 'incoming',
    id: 'minh-7',
    kind: 'text',
    text: 'Okeee, đợi bạn chút mình mời nốt người cuối 💜',
    createdAt: fixtureTimestamp(20, 33),
  },
  {
    direction: 'outgoing',
    id: 'minh-8',
    kind: 'text',
    deliveryStatus: 'read',
    text: '👊🏻',
    createdAt: fixtureTimestamp(20, 33),
  },
  { direction: 'incoming', id: 'minh-typing', kind: 'typing' },
];

function compactMessages(
  incomingText: string,
  outgoingText = 'Mình thấy rồi, lát mình phản hồi nhé.',
): readonly ChatMessage[] {
  return [
    {
      direction: 'incoming',
      id: 'compact-1',
      kind: 'text',
      text: incomingText,
      createdAt: fixtureTimestamp(20, 24),
    },
    {
      direction: 'outgoing',
      id: 'compact-2',
      kind: 'text',
      deliveryStatus: 'read',
      text: outgoingText,
      createdAt: fixtureTimestamp(20, 26),
    },
  ];
}

const khoaJungleMessages: readonly ChatMessage[] = [
  {
    direction: 'incoming',
    heroName: 'Nakroth · Đi Rừng',
    id: 'khoa-build-1',
    kind: 'build-share',
    preview: buildAssets.nakroth,
    roleIcon: buildAssets.jungleIcon,
    summary: 'Build áp sát, ưu tiên xuyên giáp và hồi chiêu.',
    tags: ['Xuyên giáp', 'Hồi chiêu'],
    text: 'Mình vừa gửi ảnh build rừng mới, xem thử nhé.',
    createdAt: fixtureTimestamp(20, 24),
  },
  {
    direction: 'outgoing',
    id: 'khoa-build-2',
    kind: 'text',
    deliveryStatus: 'read',
    text: 'Mình thấy rồi, lát mình phản hồi nhé.',
    createdAt: fixtureTimestamp(20, 26),
  },
];

const threads: Record<string, ChatThread> = {
  'aya-only': {
    avatar: avatars.energeticCarry,
    firstUnreadMessageId: 'compact-1',
    id: 'aya-only',
    isOnline: true,
    kind: 'Bạn bè',
    messages: compactMessages('Gg team, trận vừa rồi phối hợp đẹp đó!'),
    name: 'Aya Only',
    status: 'Đang online',
    unreadCount: 1,
  },
  'cozy-helen': {
    avatar: avatars.cozyGamer,
    id: 'cozy-helen',
    kind: 'Bạn bè',
    messages: compactMessages('Cuối tuần chơi normal chill không?'),
    name: 'Cozy Helen',
    status: 'Hoạt động 18 phút trước',
  },
  'cyber-violet': {
    avatar: avatars.cyberGirl,
    id: 'cyber-violet',
    isOnline: true,
    kind: 'Tri kỉ',
    messages: compactMessages('Set đêm nay mình cầm Violet nha.'),
    name: 'Cyber Violet',
    status: 'Đang online',
  },
  'huy-hoang': {
    avatar: avatars.blackFighter,
    id: 'huy-hoang',
    kind: 'Bạn bè',
    messages: compactMessages('Lần sau cùng chơi nhé!'),
    name: 'Huy Hoàng',
    status: 'Hoạt động hôm qua',
  },
  'khoa-jungle': {
    avatar: avatars.silverAssassin,
    id: 'khoa-jungle',
    isOnline: true,
    kind: 'Bạn bè',
    messages: khoaJungleMessages,
    name: 'Khoa Jungle',
    status: 'Đang online',
  },
  lorian: {
    avatar: avatars.icePrince,
    id: 'lorian',
    kind: 'Bạn bè',
    messages: compactMessages('Ok, cảm ơn bạn nhiều!'),
    name: 'Lorian',
    status: 'Hoạt động 1 giờ trước',
  },
  'minh-anh': {
    avatar: avatars.pinkSupport,
    firstUnreadMessageId: 'minh-7',
    id: 'minh-anh',
    isOnline: true,
    kind: 'Tri kỉ',
    messages: minhAnhMessages,
    name: 'Minh Anh',
    status: 'Đang online',
    unreadCount: 2,
  },
  'quoc-bao': {
    avatar: avatars.blondeMage,
    id: 'quoc-bao',
    kind: 'Bạn bè',
    messages: compactMessages('Haha ok :))))'),
    name: 'Quốc Bảo',
    status: 'Hoạt động hôm qua',
  },
  system: {
    icon: 'notifications-outline',
    firstUnreadMessageId: 'compact-1',
    id: 'system',
    kind: 'Hệ thống',
    messages: compactMessages(
      'Bạn vừa nhận được phần thưởng nhiệm vụ tuần.',
      'Xem phần thưởng',
    ),
    name: 'Hệ thống',
    status: 'Thông báo tự động',
    unreadCount: 3,
  },
  'team-sao-bang': {
    icon: 'sparkles',
    firstUnreadMessageId: 'compact-1',
    id: 'team-sao-bang',
    isOnline: true,
    kind: 'Team',
    messages: compactMessages('Mai 8h tối mọi người vào đủ nhé.'),
    name: 'Team Sao Băng',
    status: '4 thành viên đang online',
    unreadCount: 5,
  },
};

export function findChatThreadFixture(conversationId: string) {
  return threads[conversationId];
}

export function listChatThreadFixtures() {
  return Object.values(threads);
}
