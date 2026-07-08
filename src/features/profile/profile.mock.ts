import type { ImageSourcePropType } from 'react-native';

export type ProfileMockHero = {
  imageSource: ImageSourcePropType;
  matches: number;
  name: string;
  slug: string;
  winRate: number;
};

export type ProfileMockReview = {
  author: string;
  body: string;
};

export type ProfileMockAchievement = {
  description: string;
  title: string;
};

export const profileMockMinhAnhUserId = 'minh-anh';

export const profileMockStats = {
  matches: 356,
  winRate: 64,
  rating: 4.9,
  reputation: 99,
} as const;

export const profileMockVibe = 92;

export const profileMockReviews: ProfileMockReview[] = [
  {
    author: 'Kairi',
    body: 'Đánh rất hay, call chuẩn, cực kỳ ăn ý!',
  },
  {
    author: 'BảoNam',
    body: 'Support mượt, bảo kê tốt, teamwork tuyệt vời.',
  },
];

export const profileMockAchievements: ProfileMockAchievement[] = [
  {
    description: 'Đạt chuỗi 10 trận thắng liên tiếp',
    title: 'Chuỗi thắng 10',
  },
  {
    description: 'Đạt MVP 7 lần trong tháng',
    title: 'MVP Siêu cấp',
  },
];

export const profileMockPlayStyleTags = [
  'Rank',
  'Mic on',
  'Buổi tối',
  'Teamplay',
  'Không toxic',
] as const;

export const profileMockHeroes: ProfileMockHero[] = [
  {
    imageSource: require('../../../assets/anh_mau2/heroes/aya.webp') as ImageSourcePropType,
    matches: 128,
    name: 'Aya',
    slug: 'aya',
    winRate: 67,
  },
  {
    imageSource: require('../../../assets/anh_mau2/heroes/helen.webp') as ImageSourcePropType,
    matches: 96,
    name: 'Helen',
    slug: 'helen',
    winRate: 63,
  },
  {
    imageSource: require('../../../assets/anh_mau2/heroes/annette.webp') as ImageSourcePropType,
    matches: 84,
    name: 'Annette',
    slug: 'annette',
    winRate: 61,
  },
];

export const profileMockQuote =
  'Teamwork, giao tranh sạch, không toxic.';
