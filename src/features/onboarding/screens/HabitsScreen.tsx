import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  CompletedHabitAnswersSchema,
  DECISION_STYLE_CATALOG,
  FEEDBACK_STYLE_CATALOG,
  LOSS_RESPONSE_CATALOG,
  PROFILE_LIMITS,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  TIME_PREFERENCE_CATALOG,
  TimezoneSchema,
  buildRecurringAvailabilityFromTimePreferences,
  type AvailabilityDayOfWeek,
  type CatalogOption,
  type ComebackResponseId,
  type CommunicationPreferenceId,
  type DecisionStyleId,
  type FeedbackStyleId,
  type LossResponseId,
  type SeriousnessId,
  type SessionLengthId,
  type StrategyStyleId,
  type TeamAtmosphereId,
  type TeamGoalId,
  type TimePreferenceId,
} from '@/entities/player-profile';
import {
  OnboardingChip,
  OnboardingCinematicShell,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
  OnboardingSection,
} from '@/features/onboarding/components/OnboardingCinematic';

import {
  savePersistedOnboardingStep,
  usePersistedOnboardingDraftStore,
} from '../model/persisted-onboarding-draft';

const dayOptions: readonly {
  id: AvailabilityDayOfWeek;
  label: string;
}[] = [
  { id: 1, label: 'T2' },
  { id: 2, label: 'T3' },
  { id: 3, label: 'T4' },
  { id: 4, label: 'T5' },
  { id: 5, label: 'T6' },
  { id: 6, label: 'T7' },
  { id: 0, label: 'CN' },
];

const seriousnessDescriptions: Record<SeriousnessId, string> = {
  'seriousness.balanced': 'Muốn thắng nhưng vẫn giữ không khí dễ chịu.',
  'seriousness.casual': 'Ưu tiên vui vẻ, không áp lực kết quả.',
  'seriousness.competitive': 'Ưu tiên hiệu suất, tập trung và cải thiện.',
};

type ChipProps = {
  disabled?: boolean;
  label: string;
  meta?: string;
  onPress: () => void;
  selected: boolean;
};

function toggleValue<T>(current: T[], value: T, limit?: number) {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (limit && current.length >= limit) return current;
  return [...current, value];
}

function Chip({ disabled, label, meta, onPress, selected }: ChipProps) {
  return (
    <OnboardingChip
      disabled={disabled}
      meta={meta}
      onPress={onPress}
      selected={selected}
      title={label}
    />
  );
}

function MultiCatalogSection<Id extends string>({
  limit,
  onToggle,
  options,
  selected,
  subtitle,
  title,
}: {
  limit?: number;
  onToggle: (value: Id) => void;
  options: readonly CatalogOption<Id>[];
  selected: Id[];
  subtitle?: string;
  title: string;
}) {
  return (
    <OnboardingSection
      meta={limit ? `${selected.length}/${limit}` : undefined}
      subtitle={subtitle}
      title={title}
    >
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const disabled =
            Boolean(limit) &&
            selected.length >= Number(limit) &&
            !selected.includes(option.id);
          return (
            <Chip
              disabled={disabled}
              key={option.id}
              label={option.label}
              onPress={() => onToggle(option.id)}
              selected={selected.includes(option.id)}
            />
          );
        })}
      </View>
    </OnboardingSection>
  );
}

function SingleCatalogSection<Id extends string>({
  onSelect,
  options,
  selected,
  subtitle,
  title,
}: {
  onSelect: (value: Id) => void;
  options: readonly CatalogOption<Id>[];
  selected: Id | null;
  subtitle?: string;
  title: string;
}) {
  return (
    <OnboardingSection subtitle={subtitle} title={title}>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            onPress={() => onSelect(option.id)}
            selected={selected === option.id}
          />
        ))}
      </View>
    </OnboardingSection>
  );
}

export default function HabitsScreen() {
  const persistedProfile = usePersistedOnboardingDraftStore(
    (state) => state.envelope?.data.profile,
  );
  const persistedHabits = persistedProfile?.habits;
  const [communication, setCommunication] = useState<
    CommunicationPreferenceId[]
  >(persistedHabits?.communicationPreferenceIds ?? []);
  const [onlineTimes, setOnlineTimes] = useState<TimePreferenceId[]>(
    persistedHabits?.timePreferenceIds ?? [],
  );
  const [days, setDays] = useState<AvailabilityDayOfWeek[]>(() =>
    persistedProfile?.recurringAvailability
      ? [
          ...new Set(
            persistedProfile.recurringAvailability.slots.map(
              (slot) => slot.dayOfWeek,
            ),
          ),
        ]
      : [],
  );
  const [decisionStyle, setDecisionStyle] = useState<DecisionStyleId | null>(
    persistedHabits?.decisionStyleId ?? null,
  );
  const [sessionLength, setSessionLength] = useState<SessionLengthId | null>(
    persistedHabits?.sessionLengthId ?? null,
  );
  const [goals, setGoals] = useState<TeamGoalId[]>(
    persistedHabits?.teamGoalIds ?? [],
  );
  const [seriousness, setSeriousness] = useState<SeriousnessId | null>(
    persistedHabits?.seriousnessId ?? null,
  );
  const [strategies, setStrategies] = useState<StrategyStyleId[]>(
    persistedHabits?.strategyStyleIds ?? [],
  );
  const [atmospheres, setAtmospheres] = useState<TeamAtmosphereId[]>(
    persistedHabits?.teamAtmosphereIds ?? [],
  );
  const [feedbackStyle, setFeedbackStyle] = useState<FeedbackStyleId | null>(
    persistedHabits?.feedbackStyleId ?? null,
  );
  const [lossResponse, setLossResponse] = useState<LossResponseId | null>(
    persistedHabits?.lossResponseId ?? null,
  );
  const [comebackResponse, setComebackResponse] =
    useState<ComebackResponseId | null>(
      persistedHabits?.comebackResponseId ?? null,
    );
  const [timezone] = useState(
    () => persistedProfile?.timezone ?? detectDeviceTimezone(),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const habits = useMemo(() => {
    const parsed = CompletedHabitAnswersSchema.safeParse({
      comebackResponseId: comebackResponse,
      communicationPreferenceIds: communication,
      decisionStyleId: decisionStyle,
      feedbackStyleId: feedbackStyle,
      lossResponseId: lossResponse,
      seriousnessId: seriousness,
      sessionLengthId: sessionLength,
      strategyStyleIds: strategies,
      teamAtmosphereIds: atmospheres,
      teamGoalIds: goals,
      timePreferenceIds: onlineTimes,
    });
    return parsed.success ? parsed.data : null;
  }, [
    atmospheres,
    comebackResponse,
    communication,
    decisionStyle,
    feedbackStyle,
    goals,
    lossResponse,
    onlineTimes,
    seriousness,
    sessionLength,
    strategies,
  ]);

  const canSubmit = Boolean(habits && timezone && days.length > 0 && !saving);

  const submit = async () => {
    if (!habits || !timezone || days.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const recurringAvailability =
        buildRecurringAvailabilityFromTimePreferences({
          daysOfWeek: days,
          timePreferenceIds: habits.timePreferenceIds,
          timezone,
        });
      await savePersistedOnboardingStep(
        { habits, recurringAvailability, timezone },
        'profile_media',
      );
      router.push(appRoutes.onboarding.profileMedia);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Không thể lưu thói quen chơi đội.',
      );
      setSaving(false);
    }
  };

  return (
    <OnboardingCinematicShell
      contentContainerStyle={styles.content}
      footer={
        <View>
          <OnboardingPrimaryButton
            disabled={!canSubmit}
            onPress={() => void submit()}
            tone="cyan"
          >
            Tiếp tục
          </OnboardingPrimaryButton>
          <OnboardingSecondaryAction onPress={() => router.back()}>
            Quay lại
          </OnboardingSecondaryAction>
        </View>
      }
      headerDensity="compact"
      step={5}
      subtitle="Tín hiệu về lịch online, giao tiếp và không khí đội giúp Liqi chọn đúng người cùng gu."
      title="Thói quen chơi đội"
      tone="cyan"
    >
      <MultiCatalogSection
        limit={PROFILE_LIMITS.communicationPreferences}
        onToggle={(value) =>
          setCommunication((current) =>
            toggleValue(
              current,
              value,
              PROFILE_LIMITS.communicationPreferences,
            ),
          )
        }
        options={COMMUNICATION_PREFERENCE_CATALOG}
        selected={communication}
        subtitle="Cách bạn muốn phối hợp khi chơi."
        title="Giao tiếp"
      />

      <OnboardingSection
        meta={`${days.length}/7`}
        subtitle="Chọn chính xác các ngày bạn thường có thể chơi."
        title="Ngày thường chơi"
      >
        <View style={styles.chipWrap}>
          {dayOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              onPress={() =>
                setDays((current) => toggleValue(current, option.id))
              }
              selected={days.includes(option.id)}
            />
          ))}
        </View>
      </OnboardingSection>

      <OnboardingSection
        meta={`${onlineTimes.length}/${TIME_PREFERENCE_CATALOG.length}`}
        subtitle="Các khoảng giờ được hiểu theo timezone của thiết bị."
        title="Thời gian online"
      >
        <View style={styles.chipWrap}>
          {TIME_PREFERENCE_CATALOG.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              meta={formatTimeWindow(option.window)}
              onPress={() =>
                setOnlineTimes((current) => toggleValue(current, option.id))
              }
              selected={onlineTimes.includes(option.id)}
            />
          ))}
        </View>
        <Text style={styles.timezone}>
          {timezone
            ? `Múi giờ: ${timezone}`
            : 'Không xác định được múi giờ IANA trên thiết bị này.'}
        </Text>
      </OnboardingSection>

      <SingleCatalogSection
        onSelect={setDecisionStyle}
        options={DECISION_STYLE_CATALOG}
        selected={decisionStyle}
        subtitle="Kỳ vọng về gọi kèo và nghe call."
        title="Cách quyết định"
      />
      <SingleCatalogSection
        onSelect={setSessionLength}
        options={SESSION_LENGTH_CATALOG}
        selected={sessionLength}
        subtitle="Một phiên chơi bình thường nên kéo dài bao lâu."
        title="Độ dài phiên chơi"
      />
      <MultiCatalogSection
        limit={PROFILE_LIMITS.teamGoals}
        onToggle={(value) =>
          setGoals((current) =>
            toggleValue(current, value, PROFILE_LIMITS.teamGoals),
          )
        }
        options={TEAM_GOAL_CATALOG}
        selected={goals}
        subtitle="Điều bạn đang muốn từ đồng đội."
        title="Mục tiêu ghép đội"
      />
      <SingleCatalogSection
        onSelect={setSeriousness}
        options={SERIOUSNESS_CATALOG}
        selected={seriousness}
        subtitle={
          seriousness ? seriousnessDescriptions[seriousness] : undefined
        }
        title="Mức độ nghiêm túc"
      />
      <MultiCatalogSection
        limit={PROFILE_LIMITS.strategyStyles}
        onToggle={(value) =>
          setStrategies((current) =>
            toggleValue(current, value, PROFILE_LIMITS.strategyStyles),
          )
        }
        options={STRATEGY_STYLE_CATALOG}
        selected={strategies}
        subtitle="Sở thích lối chơi, không phải cam kết kỹ năng."
        title="Lối chơi chiến thuật"
      />
      <MultiCatalogSection
        limit={PROFILE_LIMITS.teamAtmospheres}
        onToggle={(value) =>
          setAtmospheres((current) =>
            toggleValue(current, value, PROFILE_LIMITS.teamAtmospheres),
          )
        }
        options={TEAM_ATMOSPHERE_CATALOG}
        selected={atmospheres}
        subtitle="Không khí đội bạn muốn ghép cùng."
        title="Không khí đội"
      />
      <SingleCatalogSection
        onSelect={setFeedbackStyle}
        options={FEEDBACK_STYLE_CATALOG}
        selected={feedbackStyle}
        subtitle="Cách góp ý trong hoặc sau trận."
        title="Cách góp ý"
      />
      <SingleCatalogSection
        onSelect={setLossResponse}
        options={LOSS_RESPONSE_CATALOG}
        selected={lossResponse}
        subtitle="Bạn muốn xử lý thế nào sau vài trận thua."
        title="Sau chuỗi thua"
      />
      <SingleCatalogSection
        onSelect={setComebackResponse}
        options={COMEBACK_RESPONSE_CATALOG}
        selected={comebackResponse}
        subtitle="Cách bạn quyết định khi trận đấu đang xấu đi."
        title="Khi trận đấu bất lợi"
      />
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
    </OnboardingCinematicShell>
  );
}

function detectDeviceTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parsed = TimezoneSchema.safeParse(timezone);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function formatTimeWindow(window: { endMinute: number; startMinute: number }) {
  return `${formatMinute(window.startMinute)}-${formatMinute(window.endMinute)}`;
}

function formatMinute(minute: number) {
  const normalized = minute % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60,
  ).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  content: { gap: 8, paddingBottom: 8 },
  error: {
    color: '#FF9AAB',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  timezone: {
    color: 'rgba(222,228,251,0.42)',
    fontSize: 10.5,
    marginTop: 8,
  },
});
