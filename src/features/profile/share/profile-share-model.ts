import { profileShareUi } from '../ui/profile-share-ui';

export type ProfileShareRatio = 'story' | 'feed' | 'square';
export type ProfileShareTemplate = 'fantasy' | 'minimal' | 'rank';
export type ProfileShareCta = 'teamup' | 'clean' | 'rank' | 'support';

export type ProfileShareOption<Value extends string> = Readonly<{
  id: Value;
  label: string;
  meta?: string;
}>;

export const profileShareCtaOptions: readonly (ProfileShareOption<ProfileShareCta> & {
  text: string;
})[] = [
  {
    id: 'teamup',
    label: 'Tìm đồng đội',
    text: 'Đang tìm đồng đội leo rank tối nay',
  },
  {
    id: 'clean',
    label: 'Không toxic',
    text: 'Teamwork, giao tranh sạch, không toxic',
  },
  {
    id: 'rank',
    label: 'Leo rank',
    text: 'Cần team sạch để leo rank tối nay',
  },
  {
    id: 'support',
    label: 'Teamplay',
    text: 'Support/teamplay, mic on, đánh bình tĩnh',
  },
] as const;

export const profileShareRatioOptions: readonly ProfileShareOption<ProfileShareRatio>[] =
  [
    { id: 'story', label: 'Story 9:16', meta: '1080 × 1920' },
    { id: 'feed', label: 'Feed 4:5', meta: '1080 × 1350' },
    { id: 'square', label: 'Vuông 1:1', meta: '1080 × 1080' },
  ] as const;

export const profileShareTemplateOptions: readonly ProfileShareOption<ProfileShareTemplate>[] =
  [
    { id: 'fantasy', label: 'Fantasy', meta: 'chất LiQi' },
    { id: 'minimal', label: 'Tối giản', meta: 'ít hiệu ứng' },
    { id: 'rank', label: 'Rank', meta: 'nhấn cấp độ' },
  ] as const;

export function profileShareRatioConfig(ratio: ProfileShareRatio) {
  return profileShareUi.card[ratio];
}

export function profileSharePreviewWidth(ratio: ProfileShareRatio) {
  if (ratio === 'story') return profileShareUi.preview.storyWidth;
  if (ratio === 'feed') return profileShareUi.preview.feedWidth;
  return profileShareUi.preview.squareWidth;
}
