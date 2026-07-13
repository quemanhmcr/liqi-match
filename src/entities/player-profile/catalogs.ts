import { HERO_CLASS_CATALOG } from '@/entities/hero';

export type CatalogOption<
  Id extends string,
  LegacyValue extends string = string,
> = Readonly<{
  id: Id;
  label: string;
  /** Existing backend value. Never use this field as UI or domain identity. */
  legacyValue: LegacyValue;
}>;

export const PROFILE_CONTRACT_VERSION = 1 as const;
export const ONBOARDING_DRAFT_ENVELOPE_KIND = 'liqi.onboarding-draft' as const;
export const DEFAULT_PROFILE_LOCALE_ID = 'vi-VN' as const;
export const GLOBAL_REGION_LEGACY_VALUE = 'global' as const;

export const PROFILE_LIMITS = {
  communicationPreferences: 2,
  displayName: 20,
  favoriteHeroes: 3,
  gameHandle: 64,
  lanes: 2,
  matchIntentNote: 160,
  strategyStyles: 3,
  teamAtmospheres: 2,
  teamGoals: 2,
  wallMedia: 4,
} as const;

export const RANK_CATALOG = [
  { id: 'iron', label: 'Sắt', legacyValue: 'iron' },
  { id: 'bronze', label: 'Đồng', legacyValue: 'bronze' },
  { id: 'silver', label: 'Bạc', legacyValue: 'silver' },
  { id: 'gold', label: 'Vàng', legacyValue: 'gold' },
  { id: 'platinum', label: 'Bạch Kim', legacyValue: 'platinum' },
  { id: 'diamond', label: 'Kim Cương', legacyValue: 'diamond' },
  { id: 'veteran', label: 'Tinh Anh', legacyValue: 'veteran' },
  { id: 'master', label: 'Cao Thủ', legacyValue: 'master' },
  {
    id: 'grandmaster-iv',
    label: 'Đại Cao Thủ IV',
    legacyValue: 'grandmaster_iv',
  },
  {
    id: 'grandmaster-iii',
    label: 'Đại Cao Thủ III',
    legacyValue: 'grandmaster_iii',
  },
  {
    id: 'grandmaster-ii',
    label: 'Đại Cao Thủ II',
    legacyValue: 'grandmaster_ii',
  },
  {
    id: 'grandmaster-i',
    label: 'Đại Cao Thủ I',
    legacyValue: 'grandmaster_i',
  },
  { id: 'conqueror', label: 'Chiến Tướng', legacyValue: 'conqueror' },
  { id: 'legendary', label: 'Chiến Thần', legacyValue: 'legendary' },
] as const satisfies readonly CatalogOption<string>[];

export type RankId = (typeof RANK_CATALOG)[number]['id'];

export const LANE_CATALOG = [
  { id: 'slayer', label: 'Đường Tà Thần', legacyValue: 'slayer' },
  { id: 'jungle', label: 'Đi Rừng', legacyValue: 'jungle' },
  { id: 'mid', label: 'Đường Giữa', legacyValue: 'mid' },
  { id: 'dragon', label: 'Đường Rồng', legacyValue: 'dragon' },
  { id: 'support', label: 'Trợ Thủ', legacyValue: 'support' },
] as const satisfies readonly CatalogOption<string>[];

export type LaneSlug = (typeof LANE_CATALOG)[number]['id'];

export const GENDER_CATALOG = [
  { id: 'male', label: 'Nam', legacyValue: 'male' },
  { id: 'female', label: 'Nữ', legacyValue: 'female' },
  { id: 'hidden', label: 'Ẩn', legacyValue: 'hidden' },
] as const satisfies readonly CatalogOption<string>[];

export type GenderId = (typeof GENDER_CATALOG)[number]['id'];

export const LOCALE_CATALOG = [
  { id: 'vi-VN', label: 'Tiếng Việt', legacyValue: 'vi' },
] as const satisfies readonly CatalogOption<string>[];

export type ProfileLocaleId = (typeof LOCALE_CATALOG)[number]['id'];

export const COMMUNICATION_PREFERENCE_CATALOG = [
  {
    id: 'communication.voice-proactive',
    label: 'Voice chủ động',
    legacyValue: 'Voice chủ động',
  },
  {
    id: 'communication.voice-as-needed',
    label: 'Voice khi cần',
    legacyValue: 'Voice khi cần',
  },
  {
    id: 'communication.listen-only',
    label: 'Chỉ nghe voice',
    legacyValue: 'Chỉ nghe voice',
  },
  {
    id: 'communication.text-ping',
    label: 'Ping/chat là chính',
    legacyValue: 'Ping/chat là chính',
  },
  {
    id: 'communication.minimal',
    label: 'Ít giao tiếp, tập trung chơi',
    legacyValue: 'Ít giao tiếp, tập trung chơi',
  },
] as const satisfies readonly CatalogOption<string>[];

export type CommunicationPreferenceId =
  (typeof COMMUNICATION_PREFERENCE_CATALOG)[number]['id'];

export type TimePreferenceWindow = Readonly<{
  /** Minutes after local midnight. End at or below start means overnight. */
  endMinute: number;
  startMinute: number;
}>;

export const TIME_PREFERENCE_CATALOG = [
  {
    id: 'time.morning',
    label: 'Sáng',
    legacyValue: 'Sáng',
    window: { startMinute: 6 * 60, endMinute: 11 * 60 },
  },
  {
    id: 'time.midday',
    label: 'Trưa',
    legacyValue: 'Trưa',
    window: { startMinute: 11 * 60, endMinute: 14 * 60 },
  },
  {
    id: 'time.afternoon',
    label: 'Chiều',
    legacyValue: 'Chiều',
    window: { startMinute: 14 * 60, endMinute: 18 * 60 },
  },
  {
    id: 'time.evening',
    label: 'Tối',
    legacyValue: 'Tối',
    window: { startMinute: 18 * 60, endMinute: 24 * 60 },
  },
  {
    id: 'time.late-night',
    label: 'Khuya',
    legacyValue: 'Khuya',
    window: { startMinute: 22 * 60, endMinute: 3 * 60 },
  },
] as const satisfies readonly (CatalogOption<string> & {
  window: TimePreferenceWindow;
})[];

export type TimePreferenceId = (typeof TIME_PREFERENCE_CATALOG)[number]['id'];

export const SERIOUSNESS_CATALOG = [
  {
    id: 'seriousness.casual',
    label: 'Thoải mái',
    legacyValue: 'Thoải mái',
  },
  {
    id: 'seriousness.balanced',
    label: 'Cân bằng',
    legacyValue: 'Cân bằng',
  },
  {
    id: 'seriousness.competitive',
    label: 'Cạnh tranh',
    legacyValue: 'Cạnh tranh',
  },
] as const satisfies readonly CatalogOption<string>[];

export type SeriousnessId = (typeof SERIOUSNESS_CATALOG)[number]['id'];

export const DECISION_STYLE_CATALOG = [
  {
    id: 'decision.shot-call',
    label: 'Thích shot-call',
    legacyValue: 'Thích shot-call',
  },
  {
    id: 'decision.follow-call',
    label: 'Thích follow call',
    legacyValue: 'Thích follow call',
  },
  {
    id: 'decision.discuss',
    label: 'Cùng trao đổi trước khi quyết định',
    legacyValue: 'Cùng trao đổi trước khi quyết định',
  },
  {
    id: 'decision.autonomous',
    label: 'Tự chủ, không thích bị chỉ đạo nhiều',
    legacyValue: 'Tự chủ, không thích bị chỉ đạo nhiều',
  },
] as const satisfies readonly CatalogOption<string>[];

export type DecisionStyleId = (typeof DECISION_STYLE_CATALOG)[number]['id'];

export const SESSION_LENGTH_CATALOG = [
  {
    id: 'session.one-two',
    label: '1-2 trận',
    legacyValue: '1-2 trận',
  },
  {
    id: 'session.three-five',
    label: '3-5 trận',
    legacyValue: '3-5 trận',
  },
  {
    id: 'session.long',
    label: 'Chơi dài, từ 6 trận',
    legacyValue: 'Chơi dài, từ 6 trận',
  },
  {
    id: 'session.flexible',
    label: 'Không cố định',
    legacyValue: 'Không cố định',
  },
] as const satisfies readonly CatalogOption<string>[];

export type SessionLengthId = (typeof SESSION_LENGTH_CATALOG)[number]['id'];

export const TEAM_GOAL_CATALOG = [
  {
    id: 'goal.rank-climb',
    label: 'Leo rank nghiêm túc',
    legacyValue: 'Leo rank nghiêm túc',
  },
  {
    id: 'goal.practice',
    label: 'Luyện kỹ năng hoặc tướng mới',
    legacyValue: 'Luyện kỹ năng hoặc tướng mới',
  },
  {
    id: 'goal.long-term-duo',
    label: 'Tìm duo lâu dài',
    legacyValue: 'Tìm duo lâu dài',
  },
  {
    id: 'goal.casual',
    label: 'Chơi vui, thư giãn',
    legacyValue: 'Chơi vui, thư giãn',
  },
  {
    id: 'goal.strategy',
    label: 'Thử chiến thuật hoặc đội hình',
    legacyValue: 'Thử chiến thuật hoặc đội hình',
  },
  {
    id: 'goal.stable-teamwork',
    label: 'Tìm người phối hợp ổn định',
    legacyValue: 'Tìm người phối hợp ổn định',
  },
] as const satisfies readonly CatalogOption<string>[];

export type TeamGoalId = (typeof TEAM_GOAL_CATALOG)[number]['id'];

export const STRATEGY_STYLE_CATALOG = [
  ['strategy.early-fights', 'Chủ động giao tranh sớm'],
  ['strategy.objectives', 'Ưu tiên kiểm soát mục tiêu'],
  ['strategy.macro', 'Ưu tiên macro và di chuyển'],
  ['strategy.skirmish', 'Ưa combat và giao tranh nhỏ'],
  ['strategy.low-risk', 'Đánh chắc, hạn chế rủi ro'],
  ['strategy.scale', 'Farm và tăng tiến về cuối trận'],
  ['strategy.playmaking', 'Chủ động tạo đột biến'],
  ['strategy.protect', 'Bảo kê và hỗ trợ đồng đội'],
  ['strategy.cover', 'Di chuyển cover đồng đội'],
  ['strategy.plan', 'Thích đánh theo kế hoạch'],
  ['strategy.adaptive', 'Linh hoạt theo thế trận'],
  ['strategy.press-advantage', 'Thích ép lợi thế nhanh'],
  ['strategy.patient', 'Kiên nhẫn chờ cơ hội'],
].map(([id, label]) => ({
  id,
  label,
  legacyValue: label,
})) as readonly CatalogOption<
  | 'strategy.early-fights'
  | 'strategy.objectives'
  | 'strategy.macro'
  | 'strategy.skirmish'
  | 'strategy.low-risk'
  | 'strategy.scale'
  | 'strategy.playmaking'
  | 'strategy.protect'
  | 'strategy.cover'
  | 'strategy.plan'
  | 'strategy.adaptive'
  | 'strategy.press-advantage'
  | 'strategy.patient'
>[];

export type StrategyStyleId = (typeof STRATEGY_STYLE_CATALOG)[number]['id'];

export const TEAM_ATMOSPHERE_CATALOG = [
  ['atmosphere.focused', 'Tập trung, ít nói'],
  ['atmosphere.friendly', 'Thân thiện, nói chuyện vừa phải'],
  ['atmosphere.social', 'Vui vẻ, tương tác nhiều'],
  ['atmosphere.respectful', 'Nghiêm túc nhưng tôn trọng'],
  ['atmosphere.calm', 'Bình tĩnh, không tạo áp lực'],
  ['atmosphere.analytical', 'Thích trao đổi và phân tích'],
].map(([id, label]) => ({
  id,
  label,
  legacyValue: label,
})) as readonly CatalogOption<
  | 'atmosphere.focused'
  | 'atmosphere.friendly'
  | 'atmosphere.social'
  | 'atmosphere.respectful'
  | 'atmosphere.calm'
  | 'atmosphere.analytical'
>[];

export type TeamAtmosphereId = (typeof TEAM_ATMOSPHERE_CATALOG)[number]['id'];

export const FEEDBACK_STYLE_CATALOG = [
  ['feedback.direct', 'Có thể góp ý trực tiếp trong trận'],
  ['feedback.brief', 'Chỉ nhắc ngắn gọn trong trận'],
  ['feedback.post-game', 'Phân tích sau trận'],
  ['feedback.on-request', 'Chỉ góp ý khi mình hỏi'],
  ['feedback.none', 'Không muốn coaching'],
].map(([id, label]) => ({
  id,
  label,
  legacyValue: label,
})) as readonly CatalogOption<
  | 'feedback.direct'
  | 'feedback.brief'
  | 'feedback.post-game'
  | 'feedback.on-request'
  | 'feedback.none'
>[];

export type FeedbackStyleId = (typeof FEEDBACK_STYLE_CATALOG)[number]['id'];

export const LOSS_RESPONSE_CATALOG = [
  ['loss.continue', 'Chơi tiếp ngay'],
  ['loss.short-break', 'Nghỉ 5-15 phút'],
  ['loss.change-mode', 'Đổi chế độ hoặc đổi chiến thuật'],
  ['loss.stop', 'Dừng phiên chơi'],
].map(([id, label]) => ({
  id,
  label,
  legacyValue: label,
})) as readonly CatalogOption<
  'loss.continue' | 'loss.short-break' | 'loss.change-mode' | 'loss.stop'
>[];

export type LossResponseId = (typeof LOSS_RESPONSE_CATALOG)[number]['id'];

export const COMEBACK_RESPONSE_CATALOG = [
  ['comeback.keep-trying', 'Vẫn cố gắng đến cuối'],
  ['comeback.surrender', 'Sẵn sàng surrender khi cơ hội thấp'],
  ['comeback.team-decision', 'Theo quyết định chung của đội'],
].map(([id, label]) => ({
  id,
  label,
  legacyValue: label,
})) as readonly CatalogOption<
  'comeback.keep-trying' | 'comeback.surrender' | 'comeback.team-decision'
>[];

export type ComebackResponseId =
  (typeof COMEBACK_RESPONSE_CATALOG)[number]['id'];

export const HABIT_CATALOGS = {
  comebackResponses: COMEBACK_RESPONSE_CATALOG,
  communicationPreferences: COMMUNICATION_PREFERENCE_CATALOG,
  decisionStyles: DECISION_STYLE_CATALOG,
  feedbackStyles: FEEDBACK_STYLE_CATALOG,
  lossResponses: LOSS_RESPONSE_CATALOG,
  seriousness: SERIOUSNESS_CATALOG,
  sessionLengths: SESSION_LENGTH_CATALOG,
  strategyStyles: STRATEGY_STYLE_CATALOG,
  teamAtmospheres: TEAM_ATMOSPHERE_CATALOG,
  teamGoals: TEAM_GOAL_CATALOG,
  timePreferences: TIME_PREFERENCE_CATALOG,
} as const;

export type HabitId =
  | CommunicationPreferenceId
  | TimePreferenceId
  | SeriousnessId
  | DecisionStyleId
  | SessionLengthId
  | TeamGoalId
  | StrategyStyleId
  | TeamAtmosphereId
  | FeedbackStyleId
  | LossResponseId
  | ComebackResponseId;

export const PROFILE_DOMAIN_CATALOGS = {
  genders: GENDER_CATALOG,
  heroClasses: HERO_CLASS_CATALOG,
  habits: HABIT_CATALOGS,
  lanes: LANE_CATALOG,
  locales: LOCALE_CATALOG,
  ranks: RANK_CATALOG,
} as const;

export function catalogOptionById<
  const Options extends readonly CatalogOption<string>[],
>(options: Options, id: Options[number]['id']) {
  return options.find((option) => option.id === id);
}
