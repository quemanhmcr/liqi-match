import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { updateOnboardingSnapshot } from '@/features/onboarding/onboarding-store';

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
  selected: string;
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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
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
      {selected ? <Text style={styles.checkMark}>✓</Text> : null}
    </Pressable>
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
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {limit ? (
          <Text style={styles.sectionMeta}>
            {selected.length}/{limit}
          </Text>
        ) : null}
      </View>

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
    </View>
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
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

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
    </View>
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
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>Online time</Text>
          <Text style={styles.sectionSubtitle}>
            Pick every usual play window.
          </Text>
        </View>
        <Text style={styles.sectionMeta}>{selected.length}/5</Text>
      </View>

      <View style={styles.chipWrap}>
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
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

export default function HabitsScreen() {
  const [communication, setCommunication] = useState<string[]>([
    communicationChannels[1]!,
    communicationChannels[3]!,
  ]);
  const [onlineTimes, setOnlineTimes] = useState<TimePreset[]>([
    (Object.keys(timePresets) as TimePreset[])[3]!,
  ]);
  const [decisionStyle, setDecisionStyle] = useState<string>(
    decisionStyles[2]!,
  );
  const [sessionLength, setSessionLength] = useState<string>(
    sessionLengths[1]!,
  );
  const [goals, setGoals] = useState<string[]>([teamGoals[0]!, teamGoals[5]!]);
  const [seriousness, setSeriousness] = useState<Seriousness>(
    (Object.keys(seriousnessDescriptions) as Seriousness[])[1]!,
  );
  const [strategies, setStrategies] = useState<string[]>([
    strategyStyles[1]!,
    strategyStyles[2]!,
  ]);
  const [atmospheres, setAtmospheres] = useState<string[]>([
    teamAtmospheres[3]!,
  ]);
  const [feedbackStyle, setFeedbackStyle] = useState<string>(
    feedbackStyles[1]!,
  );
  const [lossResponse, setLossResponse] = useState<string>(lossResponses[1]!);
  const [comebackResponse, setComebackResponse] = useState<string>(
    comebackResponses[2]!,
  );

  const canContinue =
    communication.length > 0 &&
    onlineTimes.length > 0 &&
    goals.length > 0 &&
    strategies.length > 0 &&
    atmospheres.length > 0;

  const payload = useMemo<HabitPayload>(
    () => ({
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
    }),
    [
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
    ],
  );

  const submit = () => {
    if (!canContinue) return;
    updateOnboardingSnapshot({ habits: payload });
    router.push('/profile-media');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050713', '#070B18', '#050713']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.step}>Step 4/5</Text>
        <Text style={styles.title}>Team habits</Text>
        <Text style={styles.subtitle}>
          Keep the new clean profile flow, but capture the full matching
          signals.
        </Text>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <SummaryRow
              label="Comms"
              value={communication[0] ?? 'Pick communication'}
            />
            <SummaryRow
              label="Online"
              value={onlineTimes.join(', ') || 'Pick time'}
            />
            <SummaryRow label="Goal" value={goals[0] ?? 'Pick goal'} />
            <SummaryRow label="Mode" value={seriousness} />
          </View>

          <MultiSection
            limit={MAX_COMMUNICATION_CHANNELS}
            onToggle={(value) =>
              setCommunication((current) =>
                toggleValue(current, value, MAX_COMMUNICATION_CHANNELS),
              )
            }
            options={communicationChannels}
            selected={communication}
            subtitle="How you prefer to coordinate while playing."
            title="Communication"
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
            subtitle="Shot-calling and follow-call expectations."
            title="Decision style"
          />

          <SingleSection
            onSelect={setSessionLength}
            options={sessionLengths}
            selected={sessionLength}
            subtitle="How long a normal play session should feel."
            title="Session length"
          />

          <MultiSection
            limit={MAX_TEAM_GOALS}
            onToggle={(value) =>
              setGoals((current) => toggleValue(current, value, MAX_TEAM_GOALS))
            }
            options={teamGoals}
            selected={goals}
            subtitle="What you want from teammates right now."
            title="Team goals"
          />

          <SingleSection
            onSelect={(value) => setSeriousness(value as Seriousness)}
            options={Object.keys(seriousnessDescriptions)}
            selected={seriousness}
            subtitle={seriousnessDescriptions[seriousness]}
            title="Seriousness"
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
            subtitle="Playstyle preferences, not skill claims."
            title="Strategy style"
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
            subtitle="The team vibe you want to match with."
            title="Team atmosphere"
          />

          <SingleSection
            onSelect={setFeedbackStyle}
            options={feedbackStyles}
            selected={feedbackStyle}
            subtitle="How feedback should happen in or after matches."
            title="Feedback style"
          />

          <SingleSection
            onSelect={setLossResponse}
            options={lossResponses}
            selected={lossResponse}
            subtitle="What you prefer after a short losing streak."
            title="After losses"
          />

          <SingleSection
            onSelect={setComebackResponse}
            options={comebackResponses}
            selected={comebackResponse}
            subtitle="How you decide when a match is going badly."
            title="Comeback response"
          />
        </ScrollView>

        <Pressable
          disabled={!canContinue}
          onPress={submit}
          style={[styles.cta, !canContinue && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#050713', flex: 1 },
  safe: { flex: 1, padding: 18 },
  step: { color: '#A8AFC6', fontWeight: '800', marginTop: 8 },
  title: {
    color: '#F7F8FF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 18,
  },
  subtitle: { color: '#A8AFC6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  content: { gap: 14, paddingBottom: 22, paddingTop: 20 },
  summaryCard: {
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  summaryRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 12,
    padding: 13,
  },
  summaryLabel: {
    color: '#798097',
    fontSize: 12,
    fontWeight: '900',
    width: 64,
  },
  summaryValue: { color: '#F7F8FF', flex: 1, fontSize: 14, fontWeight: '800' },
  section: {
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  sectionHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#F7F8FF', fontSize: 18, fontWeight: '900' },
  sectionSubtitle: {
    color: '#798097',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  sectionMeta: { color: '#B44CFF', fontSize: 13, fontWeight: '900' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 43,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: 'rgba(138,77,255,0.22)',
    borderColor: '#B44CFF',
  },
  chipDisabled: { opacity: 0.42 },
  chipCopy: { gap: 2 },
  chipText: { color: '#A8AFC6', fontSize: 14, fontWeight: '800' },
  chipTextActive: { color: '#F7F8FF' },
  chipMeta: { color: '#697089', fontSize: 11, fontWeight: '800' },
  checkMark: { color: '#F7F8FF', fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.78 },
  cta: {
    alignItems: 'center',
    backgroundColor: '#8A4DFF',
    borderRadius: 20,
    padding: 17,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
