import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  OnboardingChip,
  OnboardingCinematicShell,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
  OnboardingSection,
} from '@/features/onboarding/components/OnboardingCinematic';
import { appRoutes } from '@/app-shell/navigation/routes';
import {
  comebackResponses,
  communicationChannels,
  decisionStyles,
  feedbackStyles,
  lossResponses,
  seriousnessDescriptions,
  sessionLengths,
  strategyStyles,
  teamAtmospheres,
  teamGoals,
  timePresets,
  type HabitPayload,
  type Seriousness,
  type TimePreset,
} from '@/features/onboarding/habit-options';
import {
  savePersistedOnboardingStep,
  usePersistedOnboardingDraftStore,
} from '../model/persisted-onboarding-draft';

const MAX_COMMUNICATION_CHANNELS = 2;
const MAX_TEAM_GOALS = 2;
const MAX_STRATEGY_STYLES = 3;
const MAX_TEAM_ATMOSPHERES = 2;

type ChipProps = {
  disabled?: boolean;
  label: string;
  meta?: string;
  onPress: () => void;
  selected: boolean;
};

type MultiSectionProps = {
  limit?: number;
  onToggle: (value: string) => void;
  options: readonly string[];
  selected: string[];
  subtitle?: string;
  title: string;
};

type SingleSectionProps = {
  onSelect: (value: string) => void;
  options: readonly string[];
  selected?: string;
  subtitle?: string;
  title: string;
};

function toggleValue<T extends string>(current: T[], value: T, limit?: number) {
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

function MultiSection({
  limit,
  onToggle,
  options,
  selected,
  subtitle,
  title,
}: MultiSectionProps) {
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
            !selected.includes(option);

          return (
            <Chip
              disabled={disabled}
              key={option}
              label={option}
              onPress={() => onToggle(option)}
              selected={selected.includes(option)}
            />
          );
        })}
      </View>
    </OnboardingSection>
  );
}

function SingleSection({
  onSelect,
  options,
  selected,
  subtitle,
  title,
}: SingleSectionProps) {
  return (
    <OnboardingSection subtitle={subtitle} title={title}>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            onPress={() => onSelect(option)}
            selected={selected === option}
          />
        ))}
      </View>
    </OnboardingSection>
  );
}

function TimeSection({
  selected,
  toggleTime,
}: {
  selected: TimePreset[];
  toggleTime: (value: TimePreset) => void;
}) {
  const options = Object.keys(timePresets) as TimePreset[];

  return (
    <OnboardingSection
      meta={`${selected.length}/5`}
      subtitle="Chọn các khung giờ bạn thường chơi để match đúng nhịp online."
      title="Thời gian online"
    >
      <View style={styles.timeGrid}>
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            meta={timePresets[option]}
            onPress={() => toggleTime(option)}
            selected={selected.includes(option)}
          />
        ))}
      </View>
    </OnboardingSection>
  );
}

export default function HabitsScreen() {
  const persistedHabits = usePersistedOnboardingDraftStore(
    (state) => state.envelope?.data.habits,
  );
  const [communication, setCommunication] = useState<string[]>(
    persistedHabits?.communication_channels ?? [],
  );
  const [onlineTimes, setOnlineTimes] = useState<TimePreset[]>(
    (persistedHabits?.online_time_presets ?? []).filter(isTimePreset),
  );
  const [decisionStyle, setDecisionStyle] = useState<string | undefined>(
    persistedHabits?.decision_style,
  );
  const [sessionLength, setSessionLength] = useState<string | undefined>(
    persistedHabits?.session_length,
  );
  const [goals, setGoals] = useState<string[]>(
    persistedHabits?.team_goals ?? [],
  );
  const [seriousness, setSeriousness] = useState<Seriousness | undefined>(
    isSeriousness(persistedHabits?.seriousness)
      ? persistedHabits.seriousness
      : undefined,
  );
  const [strategies, setStrategies] = useState<string[]>(
    persistedHabits?.strategy_styles ?? [],
  );
  const [atmospheres, setAtmospheres] = useState<string[]>(
    persistedHabits?.team_atmospheres ?? [],
  );
  const [feedbackStyle, setFeedbackStyle] = useState<string | undefined>(
    persistedHabits?.feedback_style,
  );
  const [lossResponse, setLossResponse] = useState<string | undefined>(
    persistedHabits?.loss_response,
  );
  const [comebackResponse, setComebackResponse] = useState<string | undefined>(
    persistedHabits?.comeback_response,
  );
  const [saving, setSaving] = useState(false);

  const payload = useMemo<HabitPayload | null>(() => {
    if (
      communication.length === 0 ||
      onlineTimes.length === 0 ||
      !decisionStyle ||
      !sessionLength ||
      goals.length === 0 ||
      !seriousness ||
      strategies.length === 0 ||
      atmospheres.length === 0 ||
      !feedbackStyle ||
      !lossResponse ||
      !comebackResponse
    ) {
      return null;
    }

    return {
      comeback_response: comebackResponse,
      communication_channels: communication,
      decision_style: decisionStyle,
      feedback_style: feedbackStyle,
      loss_response: lossResponse,
      online_time_presets: onlineTimes,
      seriousness,
      session_length: sessionLength,
      strategy_styles: strategies,
      team_atmospheres: atmospheres,
      team_goals: goals,
    };
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

  const submit = async () => {
    if (!payload || saving) return;
    setSaving(true);
    try {
      await savePersistedOnboardingStep({ habits: payload }, 'profile_media');
      router.push(appRoutes.onboarding.profileMedia);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    router.back();
  };
  return (
    <OnboardingCinematicShell
      contentContainerStyle={styles.content}
      footer={
        <View>
          <OnboardingPrimaryButton
            disabled={!payload || saving}
            onPress={() => void submit()}
            tone="cyan"
          >
            Tiếp tục
          </OnboardingPrimaryButton>
          <OnboardingSecondaryAction onPress={goBack}>
            Quay lại
          </OnboardingSecondaryAction>
        </View>
      }
      headerDensity="compact"
      step={5}
      subtitle="Tín hiệu về giờ online, giao tiếp và không khí đội giúp Liqi chọn đúng người cùng gu."
      title="Thói quen chơi đội"
      tone="cyan"
    >
      <MultiSection
        limit={MAX_COMMUNICATION_CHANNELS}
        onToggle={(value) =>
          setCommunication((current) =>
            toggleValue(current, value, MAX_COMMUNICATION_CHANNELS),
          )
        }
        options={communicationChannels}
        selected={communication}
        subtitle="Cách bạn muốn phối hợp khi chơi."
        title="Giao tiếp"
      />

      <TimeSection
        selected={onlineTimes}
        toggleTime={(value) =>
          setOnlineTimes((current) => toggleValue(current, value))
        }
      />

      <SingleSection
        onSelect={setDecisionStyle}
        options={decisionStyles}
        selected={decisionStyle}
        subtitle="Kỳ vọng về gọi kèo và nghe call."
        title="Cách quyết định"
      />

      <SingleSection
        onSelect={setSessionLength}
        options={sessionLengths}
        selected={sessionLength}
        subtitle="Một phiên chơi bình thường nên kéo dài bao lâu."
        title="Độ dài phiên chơi"
      />

      <MultiSection
        limit={MAX_TEAM_GOALS}
        onToggle={(value) =>
          setGoals((current) => toggleValue(current, value, MAX_TEAM_GOALS))
        }
        options={teamGoals}
        selected={goals}
        subtitle="Điều bạn đang muốn từ đồng đội."
        title="Mục tiêu ghép đội"
      />

      <SingleSection
        onSelect={(value) => setSeriousness(value as Seriousness)}
        options={Object.keys(seriousnessDescriptions)}
        selected={seriousness}
        subtitle={
          seriousness ? seriousnessDescriptions[seriousness] : undefined
        }
        title="Mức độ nghiêm túc"
      />

      <MultiSection
        limit={MAX_STRATEGY_STYLES}
        onToggle={(value) =>
          setStrategies((current) =>
            toggleValue(current, value, MAX_STRATEGY_STYLES),
          )
        }
        options={strategyStyles}
        selected={strategies}
        subtitle="Sở thích lối chơi, không phải cam kết kỹ năng."
        title="Lối chơi chiến thuật"
      />

      <MultiSection
        limit={MAX_TEAM_ATMOSPHERES}
        onToggle={(value) =>
          setAtmospheres((current) =>
            toggleValue(current, value, MAX_TEAM_ATMOSPHERES),
          )
        }
        options={teamAtmospheres}
        selected={atmospheres}
        subtitle="Không khí đội bạn muốn ghép cùng."
        title="Không khí đội"
      />

      <SingleSection
        onSelect={setFeedbackStyle}
        options={feedbackStyles}
        selected={feedbackStyle}
        subtitle="Cách góp ý trong hoặc sau trận."
        title="Cách góp ý"
      />

      <SingleSection
        onSelect={setLossResponse}
        options={lossResponses}
        selected={lossResponse}
        subtitle="Bạn muốn xử lý thế nào sau vài trận thua."
        title="Sau chuỗi thua"
      />

      <SingleSection
        onSelect={setComebackResponse}
        options={comebackResponses}
        selected={comebackResponse}
        subtitle="Cách bạn quyết định khi trận đấu đang xấu đi."
        title="Khi trận đấu bất lợi"
      />
    </OnboardingCinematicShell>
  );
}

function isTimePreset(value: string): value is TimePreset {
  return Object.prototype.hasOwnProperty.call(timePresets, value);
}

function isSeriousness(value: string | undefined): value is Seriousness {
  return Boolean(
    value &&
    Object.prototype.hasOwnProperty.call(seriousnessDescriptions, value),
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  content: { gap: 8, paddingBottom: 8 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
});
