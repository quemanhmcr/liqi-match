export type TimePreset = 'Sáng' | 'Trưa' | 'Chiều' | 'Tối' | 'Khuya';
export type Seriousness = 'Thoải mái' | 'Cân bằng' | 'Cạnh tranh';

export type HabitPayload = {
  communication_channels: string[];
  online_time_presets: TimePreset[];
  decision_style: string;
  session_length: string;
  team_goals: string[];
  seriousness: string;
  strategy_styles: string[];
  team_atmospheres: string[];
  feedback_style: string;
  loss_response: string;
  comeback_response: string;
};

export type TimePresetWindow = {
  /** Minutes after local midnight. Values above 1440 cross midnight. */
  endMinute: number;
  startMinute: number;
};

export const communicationChannels = [
  'Voice chủ động',
  'Voice khi cần',
  'Chỉ nghe voice',
  'Ping/chat là chính',
  'Ít giao tiếp, tập trung chơi',
] as const;

export const decisionStyles = [
  'Thích shot-call',
  'Thích follow call',
  'Cùng trao đổi trước khi quyết định',
  'Tự chủ, không thích bị chỉ đạo nhiều',
] as const;

export const sessionLengths = [
  '1-2 trận',
  '3-5 trận',
  'Chơi dài, từ 6 trận',
  'Không cố định',
] as const;

export const teamGoals = [
  'Leo rank nghiêm túc',
  'Luyện kỹ năng hoặc tướng mới',
  'Tìm duo lâu dài',
  'Chơi vui, thư giãn',
  'Thử chiến thuật hoặc đội hình',
  'Tìm người phối hợp ổn định',
] as const;

export const strategyStyles = [
  'Chủ động giao tranh sớm',
  'Ưu tiên kiểm soát mục tiêu',
  'Ưu tiên macro và di chuyển',
  'Ưa combat và giao tranh nhỏ',
  'Đánh chắc, hạn chế rủi ro',
  'Farm và tăng tiến về cuối trận',
  'Chủ động tạo đột biến',
  'Bảo kê và hỗ trợ đồng đội',
  'Di chuyển cover đồng đội',
  'Thích đánh theo kế hoạch',
  'Linh hoạt theo thế trận',
  'Thích ép lợi thế nhanh',
  'Kiên nhẫn chờ cơ hội',
] as const;

export const teamAtmospheres = [
  'Tập trung, ít nói',
  'Thân thiện, nói chuyện vừa phải',
  'Vui vẻ, tương tác nhiều',
  'Nghiêm túc nhưng tôn trọng',
  'Bình tĩnh, không tạo áp lực',
  'Thích trao đổi và phân tích',
] as const;

export const feedbackStyles = [
  'Có thể góp ý trực tiếp trong trận',
  'Chỉ nhắc ngắn gọn trong trận',
  'Phân tích sau trận',
  'Chỉ góp ý khi mình hỏi',
  'Không muốn coaching',
] as const;

export const lossResponses = [
  'Chơi tiếp ngay',
  'Nghỉ 5-15 phút',
  'Đổi chế độ hoặc đổi chiến thuật',
  'Dừng phiên chơi',
] as const;

export const comebackResponses = [
  'Vẫn cố gắng đến cuối',
  'Sẵn sàng surrender khi cơ hội thấp',
  'Theo quyết định chung của đội',
] as const;

export const timePresets: Record<TimePreset, string> = {
  Sáng: '06:00-11:00',
  Trưa: '11:00-14:00',
  Chiều: '14:00-18:00',
  Tối: '18:00-24:00',
  Khuya: '22:00-03:00',
};

/**
 * Coarse recurring local-time windows captured during onboarding.
 * Match treats these as a soft availability signal until users can choose
 * explicit weekdays or create a time-bound Match intent.
 */
export const timePresetWindows: Record<TimePreset, TimePresetWindow> = {
  Sáng: { startMinute: 6 * 60, endMinute: 11 * 60 },
  Trưa: { startMinute: 11 * 60, endMinute: 14 * 60 },
  Chiều: { startMinute: 14 * 60, endMinute: 18 * 60 },
  Tối: { startMinute: 18 * 60, endMinute: 24 * 60 },
  Khuya: { startMinute: 22 * 60, endMinute: 27 * 60 },
};

export const seriousnessDescriptions: Record<Seriousness, string> = {
  'Thoải mái': 'Ưu tiên vui vẻ, không áp lực kết quả.',
  'Cân bằng': 'Muốn thắng nhưng vẫn giữ không khí dễ chịu.',
  'Cạnh tranh': 'Ưu tiên hiệu suất, tập trung và cải thiện.',
};
