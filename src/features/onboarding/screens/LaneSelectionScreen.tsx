import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { LANE_CATALOG, type LaneSlug } from '@/entities/player-profile';
import {
  OnboardingCinematicShell,
  OnboardingOptionRow,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
} from '@/features/onboarding/components/OnboardingCinematic';

import {
  savePersistedOnboardingStep,
  usePersistedOnboardingDraftStore,
} from '../model/persisted-onboarding-draft';

const laneDescriptions: Record<LaneSlug, string> = {
  dragon: 'DPS ổn định, giữ vị trí và chuyển hoá lợi thế.',
  jungle: 'Tempo, mục tiêu lớn và nhịp call của cả đội.',
  mid: 'Roam nhanh, kiểm soát mid wave và burst chủ lực.',
  slayer: 'Solo pressure, split push và mở góc giao tranh.',
  support: 'Cover chủ lực, mở combat và giữ vision tình huống.',
};

export default function LaneSelectionScreen() {
  const persistedSelection = usePersistedOnboardingDraftStore(
    (state) => state.envelope?.data.profile.laneSelection,
  );
  const [selected, setSelected] = useState<LaneSlug[]>(() =>
    persistedSelection
      ? [
          persistedSelection.primary,
          ...(persistedSelection.secondary
            ? [persistedSelection.secondary]
            : []),
        ]
      : [],
  );
  const [saving, setSaving] = useState(false);

  const toggleLane = (id: LaneSlug) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[0]!, id];
      return [...current, id];
    });
  };

  const submit = async () => {
    const primary = selected[0];
    if (!primary || selected.length > 2 || saving) return;
    setSaving(true);
    try {
      await savePersistedOnboardingStep(
        {
          laneSelection: {
            primary,
            secondary: selected[1] ?? null,
          },
        },
        'hero_selection',
      );
      router.push(appRoutes.onboarding.heroSelection);
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingCinematicShell
      footer={
        <View>
          <OnboardingPrimaryButton
            disabled={selected.length < 1 || selected.length > 2 || saving}
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
      step={3}
      subtitle="Lane đầu tiên là ưu tiên chính; lane thứ hai là lựa chọn bổ sung khi ghép đội."
      title="Chọn lane của bạn"
      tone="cyan"
    >
      <View style={styles.list}>
        {LANE_CATALOG.map((option) => {
          const isSelected = selected.includes(option.id);
          const isPrimary = selected[0] === option.id;
          return (
            <OnboardingOptionRow
              key={option.id}
              meta={laneDescriptions[option.id]}
              onPress={() => toggleLane(option.id)}
              selected={isSelected}
              title={option.label}
              trailing={
                <View style={styles.trailingStack}>
                  {isPrimary ? (
                    <Text style={styles.primary}>Ưu tiên</Text>
                  ) : null}
                  {isSelected ? (
                    <Text style={styles.selectedMark}>✓</Text>
                  ) : null}
                </View>
              }
            />
          );
        })}
      </View>
      <Text style={styles.count}>Đã chọn {selected.length}/2 lane</Text>
    </OnboardingCinematicShell>
  );
}

const styles = StyleSheet.create({
  count: {
    color: 'rgba(222,228,251,0.36)',
    fontSize: 10.2,
    fontWeight: '400',
    marginTop: 8,
    textAlign: 'center',
  },
  list: { gap: 7, paddingTop: 11 },
  primary: {
    color: 'rgba(103,232,255,0.58)',
    fontSize: 9.2,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  selectedMark: {
    color: 'rgba(204,151,255,0.58)',
    fontSize: 12,
    fontWeight: '500',
  },
  trailingStack: { alignItems: 'flex-end', gap: 2 },
});
