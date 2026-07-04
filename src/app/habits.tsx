import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type TimePreset = 'Sáng' | 'Trưa' | 'Chiều' | 'Tối' | 'Khuya';
type Seriousness = 'Thoải mái' | 'Cân bằng' | 'Cạnh tranh';

type SingleSectionProps<T extends string> = {
  compact?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  index: number;
  onSelect: (value: T) => void;
  options: readonly T[];
  selected: T;
  subtitle?: string;
  title: string;
};

type MultiSectionProps<T extends string> = {
  compact?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  index: number;
  limit?: number;
  onToggle: (value: T) => void;
  options: readonly T[];
  selected: T[];
  subtitle?: string;
  title: string;
};

type ChipProps = {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  meta?: string;
  onPress: () => void;
  selected: boolean;
};

type SectionFrameProps = {
  children: ReactNode;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  index: number;
  meta?: string;
  subtitle?: string;
  title: string;
};

const colors = {
  bg: '#050713',
  card: 'rgba(13,17,34,0.83)',
  cardSoft: 'rgba(255,255,255,0.045)',
  border: 'rgba(174,188,244,0.12)',
  borderStrong: 'rgba(180,76,255,0.44)',
  text: '#F7F8FF',
  textMuted: '#A8AFC6',
  textDim: '#798097',
  violet: '#B44CFF',
  violetSoft: '#C679FF',
  blue: '#2D74FF',
  cyan: '#55C8FF',
  green: '#62F2A1',
  lime: '#B4F56F',
} as const;

const communicationChannels = [
  'Voice chủ động',
  'Voice khi cần',
  'Chỉ nghe voice',
  'Ping/chat là chính',
  'Ít giao tiếp, tập trung chơi',
] as const;

const decisionStyles = [
  'Thích shot-call',
  'Thích follow call',
  'Cùng trao đổi trước khi quyết định',
  'Tự chủ, không thích bị chỉ đạo nhiều',
] as const;

const timePresets: Record<TimePreset, string> = {
  Sáng: '06:00-11:00',
  Trưa: '11:00-14:00',
  Chiều: '14:00-18:00',
  Tối: '18:00-24:00',
  Khuya: '22:00-03:00',
};

const sessionLengths = [
  '1-2 trận',
  '3-5 trận',
  'Chơi dài, từ 6 trận',
  'Không cố định',
] as const;

const teamGoals = [
  'Leo rank nghiêm túc',
  'Luyện kỹ năng hoặc tướng mới',
  'Tìm duo lâu dài',
  'Chơi vui, thư giãn',
  'Thử chiến thuật hoặc đội hình',
  'Tìm người phối hợp ổn định',
] as const;

const strategyStyles = [
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

const teamAtmospheres = [
  'Tập trung, ít nói',
  'Thân thiện, nói chuyện vừa phải',
  'Vui vẻ, tương tác nhiều',
  'Nghiêm túc nhưng tôn trọng',
  'Bình tĩnh, không tạo áp lực',
  'Thích trao đổi và phân tích',
] as const;

const feedbackStyles = [
  'Có thể góp ý trực tiếp trong trận',
  'Chỉ nhắc ngắn gọn trong trận',
  'Phân tích sau trận',
  'Chỉ góp ý khi mình hỏi',
  'Không muốn coaching',
] as const;

const lossResponses = [
  'Chơi tiếp ngay',
  'Nghỉ 5-15 phút',
  'Đổi chế độ hoặc đổi chiến thuật',
  'Dừng phiên chơi',
] as const;

const comebackResponses = [
  'Vẫn cố gắng đến cuối',
  'Sẵn sàng surrender khi cơ hội thấp',
  'Theo quyết định chung của đội',
] as const;

const seriousnessDescriptions: Record<Seriousness, string> = {
  'Thoải mái': 'Ưu tiên vui vẻ, không áp lực kết quả.',
  'Cân bằng': 'Muốn thắng nhưng vẫn giữ không khí dễ chịu.',
  'Cạnh tranh': 'Ưu tiên hiệu suất, tập trung và cải thiện.',
};

function toggleValue<T extends string>(current: T[], value: T, limit?: number) {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (limit && current.length >= limit) return current;
  return [...current, value];
}

function Chip({
  compact = false,
  disabled,
  label,
  meta,
  onPress,
  selected,
}: ChipProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        selected && styles.chipActive,
        disabled && !selected && styles.chipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.chipCopy}>
        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
          {label}
        </Text>
        {meta ? <Text style={styles.chipMeta}>{meta}</Text> : null}
      </View>
      {selected ? (
        <LinearGradient
          colors={['#E6C8FF', '#9D48FF']}
          style={styles.checkDot}
        >
          <Ionicons color="#13071F" name="checkmark" size={14} />
        </LinearGradient>
      ) : null}
    </Pressable>
  );
}

function SectionFrame({
  children,
  icon,
  index,
  meta,
  subtitle,
  title,
}: SectionFrameProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons color={colors.violetSoft} name={icon} size={23} />
        <Text style={styles.sectionIndex}>{index}.</Text>
        <View style={styles.sectionCopy}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
          </View>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function MultiSection<T extends string>({
  compact,
  icon,
  index,
  limit,
  onToggle,
  options,
  selected,
  subtitle,
  title,
}: MultiSectionProps<T>) {
  return (
    <SectionFrame
      icon={icon}
      index={index}
      meta={limit ? `${selected.length}/${limit}` : undefined}
      subtitle={subtitle}
      title={title}
    >
      <View style={styles.rowWrap}>
        {options.map((item) => (
          <Chip
            compact={compact}
            disabled={Boolean(limit && selected.length >= limit && !selected.includes(item))}
            key={item}
            label={item}
            onPress={() => onToggle(item)}
            selected={selected.includes(item)}
          />
        ))}
      </View>
    </SectionFrame>
  );
}

function SingleSection<T extends string>({
  compact,
  icon,
  index,
  onSelect,
  options,
  selected,
  subtitle,
  title,
}: SingleSectionProps<T>) {
  return (
    <SectionFrame icon={icon} index={index} subtitle={subtitle} title={title}>
      <View style={styles.rowWrap}>
        {options.map((item) => (
          <Chip
            compact={compact}
            key={item}
            label={item}
            onPress={() => onSelect(item)}
            selected={selected === item}
          />
        ))}
      </View>
    </SectionFrame>
  );
}

function TimeSection({
  index,
  selected,
  toggleTime,
}: {
  index: number;
  selected: TimePreset[];
  toggleTime: (value: TimePreset) => void;
}) {
  return (
    <SectionFrame
      icon="clock-outline"
      index={index}
      meta={`${selected.length}/5`}
      subtitle="Có thể chọn nhiều khung, hệ thống tự hiểu giờ cụ thể."
      title="Thời gian thường online"
    >
      <View style={styles.rowWrap}>
        {(Object.keys(timePresets) as TimePreset[]).map((item) => (
          <Chip
            key={item}
            label={item}
            meta={timePresets[item]}
            onPress={() => toggleTime(item)}
            selected={selected.includes(item)}
          />
        ))}
      </View>
    </SectionFrame>
  );
}

function SeriousnessSection({
  selected,
  setSelected,
}: {
  selected: Seriousness;
  setSelected: (value: Seriousness) => void;
}) {
  return (
    <SectionFrame
      icon="star-four-points-outline"
      index={6}
      subtitle={seriousnessDescriptions[selected]}
      title="Mức độ cạnh tranh"
    >
      <View style={styles.segmented}>
        {(['Thoải mái', 'Cân bằng', 'Cạnh tranh'] as const).map((item) => (
          <Pressable
            accessibilityLabel={item}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === item }}
            key={item}
            onPress={() => setSelected(item)}
            style={({ pressed }) => [
              styles.segment,
              selected === item && styles.segmentActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                selected === item && styles.segmentTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
    </SectionFrame>
  );
}

function SummaryItem({
  accent,
  caption,
  icon,
  title,
}: {
  accent: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Ionicons color={accent} name={icon} size={24} />
      <Text numberOfLines={1} style={[styles.summaryTitle, { color: accent }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.summaryCaption}>
        {caption}
      </Text>
    </View>
  );
}

export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const [communication, setCommunication] = useState<string[]>([
    'Voice khi cần',
    'Ping/chat là chính',
  ]);
  const [decisionStyle, setDecisionStyle] = useState('Cùng trao đổi trước khi quyết định');
  const [onlineTimes, setOnlineTimes] = useState<TimePreset[]>(['Tối']);
  const [sessionLength, setSessionLength] = useState('3-5 trận');
  const [goals, setGoals] = useState<string[]>([
    'Leo rank nghiêm túc',
    'Tìm người phối hợp ổn định',
  ]);
  const [seriousness, setSeriousness] = useState<Seriousness>('Cân bằng');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [strategies, setStrategies] = useState<string[]>([
    'Ưu tiên kiểm soát mục tiêu',
    'Ưu tiên macro và di chuyển',
    'Bảo kê và hỗ trợ đồng đội',
  ]);
  const [atmospheres, setAtmospheres] = useState<string[]>([
    'Nghiêm túc nhưng tôn trọng',
  ]);
  const [feedbackStyle, setFeedbackStyle] = useState('Chỉ nhắc ngắn gọn trong trận');
  const [lossResponse, setLossResponse] = useState('Nghỉ 5-15 phút');
  const [comebackResponse, setComebackResponse] = useState('Theo quyết định chung của đội');

  const primaryGoal = goals[0] ?? 'Chưa chọn mục tiêu';
  const primaryCommunication = communication[0] ?? 'Chưa chọn giao tiếp';
  const advancedCaption = useMemo(() => {
    const strategy = strategies[0] ?? 'Chưa chọn chiến thuật';
    const atmosphere = atmospheres[0] ?? 'Chưa chọn không khí đội';
    return `${strategy} · ${atmosphere}`;
  }, [atmospheres, strategies]);

  const submit = () => {
    router.push('/profile-media' as never);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(109,45,220,0.36)', 'rgba(45,116,255,0.16)', 'transparent']}
        pointerEvents="none"
        style={styles.bgGlowTop}
      />
      <LinearGradient
        colors={['transparent', 'rgba(117,48,255,0.22)']}
        pointerEvents="none"
        style={styles.bgGlowBottom}
      />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Quay lại"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.text} name="chevron-back" size={28} />
          </Pressable>

          <Text accessibilityRole="header" style={styles.logo}>
            <Text style={styles.logoAccent}>Liqi</Text> Match
          </Text>

          <View accessibilityLabel="Bước 4 trên 5" style={styles.stepPill}>
            <Text style={styles.stepLabel}>Bước</Text>
            <Text style={styles.stepText}>4/5</Text>
            <LinearGradient
              colors={['#B84CFF', '#6A6BFF']}
              style={styles.stepGlow}
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 10) + 126 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.heading}>
              Chọn <Text style={styles.headingAccent}>thói quen</Text> ghép đội
            </Text>
            <Text style={styles.subtitle}>
              Ưu tiên hành vi và kỳ vọng khi chơi, không dùng các tag tự nhận
              như gánh team hay không toxic.
            </Text>
          </View>

          <MultiSection
            icon="microphone-outline"
            index={1}
            limit={2}
            onToggle={(value) =>
              setCommunication((current) => toggleValue(current, value, 2))
            }
            options={communicationChannels}
            selected={communication}
            subtitle="Tách kênh giao tiếp khỏi phong cách phối hợp."
            title="Kênh giao tiếp"
          />

          <TimeSection
            index={2}
            selected={onlineTimes}
            toggleTime={(value) =>
              setOnlineTimes((current) => toggleValue(current, value))
            }
          />

          <SingleSection
            compact
            icon="account-voice"
            index={3}
            onSelect={setDecisionStyle}
            options={decisionStyles}
            selected={decisionStyle}
            subtitle="Tránh ghép hai người cùng muốn call hoặc không thích bị chỉ đạo."
            title="Cách ra quyết định"
          />

          <SingleSection
            compact
            icon="timer-sand"
            index={4}
            onSelect={setSessionLength}
            options={sessionLengths}
            selected={sessionLength}
            subtitle="Cùng online nhưng khác nhịp chơi vẫn dễ lệch kỳ vọng."
            title="Độ dài phiên chơi"
          />

          <MultiSection
            compact
            icon="target"
            index={5}
            limit={2}
            onToggle={(value) => setGoals((current) => toggleValue(current, value, 2))}
            options={teamGoals}
            selected={goals}
            subtitle="Tách mục tiêu khỏi phong cách chơi để matching rõ hơn."
            title="Mục tiêu tìm đồng đội"
          />

          <SeriousnessSection
            selected={seriousness}
            setSelected={setSeriousness}
          />

          <View style={styles.optionalCard}>
            <Pressable
              accessibilityLabel="Tùy chọn nâng cao"
              accessibilityRole="button"
              accessibilityState={{ expanded: advancedOpen }}
              onPress={() => setAdvancedOpen((current) => !current)}
              style={({ pressed }) => [
                styles.optionalHeader,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.optionalIcon}>
                <Ionicons color={colors.violetSoft} name="options-outline" size={22} />
              </View>
              <View style={styles.optionalCopy}>
                <Text style={styles.optionalTitle}>Tùy chọn nâng cao</Text>
                <Text numberOfLines={2} style={styles.optionalSubtitle}>
                  Chiến thuật, không khí đội, góp ý và phản ứng khi thua
                </Text>
              </View>
              <Ionicons
                color={colors.textMuted}
                name={advancedOpen ? 'chevron-up' : 'chevron-down'}
                size={22}
              />
            </Pressable>

            {advancedOpen ? (
              <View style={styles.advancedContent}>
                <MultiSection
                  compact
                  icon="chess-knight"
                  index={7}
                  limit={3}
                  onToggle={(value) =>
                    setStrategies((current) => toggleValue(current, value, 3))
                  }
                  options={strategyStyles}
                  selected={strategies}
                  subtitle="Mô tả xu hướng chơi, không tự nhận năng lực."
                  title="Phong cách chiến thuật"
                />

                <MultiSection
                  compact
                  icon="account-heart-outline"
                  index={8}
                  limit={2}
                  onToggle={(value) =>
                    setAtmospheres((current) => toggleValue(current, value, 2))
                  }
                  options={teamAtmospheres}
                  selected={atmospheres}
                  subtitle="Thay cho tag chung chung như ít nói hoặc không toxic."
                  title="Không khí đội mong muốn"
                />

                <SingleSection
                  compact
                  icon="comment-check-outline"
                  index={9}
                  onSelect={setFeedbackStyle}
                  options={feedbackStyles}
                  selected={feedbackStyle}
                  subtitle="Giảm xung đột khi góp ý trong hoặc sau trận."
                  title="Cách nhận góp ý"
                />

                <SingleSection
                  compact
                  icon="weather-lightning-rainy"
                  index={10}
                  onSelect={setLossResponse}
                  options={lossResponses}
                  selected={lossResponse}
                  subtitle="Tín hiệu quan trọng sau chuỗi thua liên tiếp."
                  title="Sau 2-3 trận thua"
                />

                <SingleSection
                  compact
                  icon="flag-checkered"
                  index={11}
                  onSelect={setComebackResponse}
                  options={comebackResponses}
                  selected={comebackResponse}
                  subtitle="Kỳ vọng khi trận đấu đang bất lợi."
                  title="Khi trận đang khó"
                />
              </View>
            ) : null}
          </View>

          <SectionFrame icon="account-group-outline" index={12} title="Hồ sơ ghép đội">
            <View style={styles.summary}>
              <SummaryItem
                accent={colors.green}
                caption={decisionStyle}
                icon="mic-outline"
                title={primaryCommunication}
              />
              <View style={styles.summaryDivider} />
              <SummaryItem
                accent={colors.cyan}
                caption={sessionLength}
                icon="time-outline"
                title={onlineTimes[0] ? `Online ${onlineTimes[0].toLowerCase()}` : 'Giờ online'}
              />
              <View style={styles.summaryDivider} />
              <SummaryItem
                accent={colors.lime}
                caption={advancedOpen ? advancedCaption : seriousness}
                icon="shield-checkmark-outline"
                title={primaryGoal}
              />
            </View>
          </SectionFrame>

          <View style={styles.note}>
            <Ionicons color={colors.textDim} name="information-circle-outline" size={18} />
            <Text style={styles.noteText}>
              Các lựa chọn này là tín hiệu ghép đội mềm; dữ liệu trận và đánh giá
              sau khi chơi vẫn nên có trọng số cao hơn.
            </Text>
          </View>
        </ScrollView>

        <View
          pointerEvents="box-none"
          style={[
            styles.actionWrap,
            { paddingBottom: Math.max(insets.bottom, 10) + 10 },
          ]}
        >
          <LinearGradient
            colors={['transparent', colors.bg]}
            pointerEvents="none"
            style={styles.actionFade}
          />
          <LinearGradient
            colors={['#B638F3', '#684DFF', '#2379FF']}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={styles.ctaGradient}
          >
            <Pressable
              accessibilityLabel="Tiếp tục"
              accessibilityRole="button"
              onPress={submit}
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
            >
              <Ionicons color="#D9CCFF" name="sparkles" size={18} />
              <Text style={styles.ctaText}>Tiếp tục</Text>
              <View style={styles.ctaIcon}>
                <Ionicons color="#5F43F4" name="arrow-forward" size={24} />
              </View>
              <Ionicons color="#8DB4FF" name="sparkles" size={18} />
            </Pressable>
          </LinearGradient>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  bgGlowTop: {
    height: 280,
    left: -80,
    position: 'absolute',
    right: -80,
    top: -70,
  },
  bgGlowBottom: {
    bottom: 0,
    height: 260,
    left: -50,
    position: 'absolute',
    right: -50,
  },
  safe: {
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  logo: {
    color: colors.text,
    fontSize: 25,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(142,66,255,0.38)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 8,
  },
  logoAccent: {
    color: '#C06BFF',
  },
  stepPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,22,42,0.84)',
    borderColor: 'rgba(255,255,255,0.055)',
    borderRadius: 22,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 64,
  },
  stepLabel: {
    color: '#838BA3',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  stepText: {
    color: '#D28CFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 17,
  },
  stepGlow: {
    borderRadius: 2,
    bottom: 6,
    height: 2.5,
    position: 'absolute',
    width: 31,
  },
  content: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 10,
  },
  heading: {
    color: colors.text,
    fontSize: 33,
    fontWeight: '900',
    lineHeight: 40,
    textAlign: 'center',
  },
  headingAccent: {
    color: colors.violetSoft,
    fontStyle: 'italic',
  },
  subtitle: {
    color: '#D4D8E7',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    maxWidth: 345,
    textAlign: 'center',
  },
  section: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
  },
  sectionHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  sectionIndex: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
  },
  sectionCopy: {
    flex: 1,
    gap: 3,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },
  sectionMeta: {
    color: colors.violetSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textDim,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.cardSoft,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 45,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chipCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: 'rgba(139,63,248,0.24)',
    borderColor: colors.borderStrong,
    shadowColor: colors.violet,
    shadowOpacity: 0.34,
    shadowRadius: 10,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipCopy: {
    gap: 2,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  chipTextActive: {
    color: colors.text,
    fontWeight: '800',
  },
  chipMeta: {
    color: colors.textDim,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  checkDot: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  segmented: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: colors.border,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    minHeight: 47,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentActive: {
    backgroundColor: 'rgba(132,63,255,0.34)',
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: '800',
  },
  optionalCard: {
    backgroundColor: 'rgba(13,17,34,0.62)',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  optionalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 16,
  },
  optionalIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.12)',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  optionalCopy: {
    flex: 1,
    gap: 3,
  },
  optionalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  optionalSubtitle: {
    color: colors.textDim,
    fontSize: 12.5,
    lineHeight: 18,
  },
  advancedContent: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    padding: 10,
  },
  summary: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    paddingHorizontal: 12,
  },
  summaryItem: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  summaryCaption: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  summaryDivider: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    height: 42,
    marginHorizontal: 8,
    width: 1,
  },
  note: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  noteText: {
    color: colors.textDim,
    flexShrink: 1,
    fontSize: 13.5,
    lineHeight: 20,
  },
  actionWrap: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 0,
  },
  actionFade: {
    bottom: 0,
    height: 130,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  ctaGradient: {
    borderRadius: 26,
    shadowColor: colors.violet,
    shadowOpacity: 0.36,
    shadowRadius: 18,
  },
  ctaButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    height: 72,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  ctaPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  ctaText: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  ctaIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
});
