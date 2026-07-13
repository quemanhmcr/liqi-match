import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  OnboardingCinematicShell,
  OnboardingOptionRow,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
} from '@/features/onboarding/components/OnboardingCinematic';
import { appRoutes } from '@/app-shell/navigation/routes';
import {
  savePersistedOnboardingStep,
  usePersistedOnboardingDraftStore,
} from '../model/persisted-onboarding-draft';

const lanes = [
  [
    'slayer',
    'Đường Tà thần',
    'Solo pressure, split push và mở góc giao tranh.',
  ],
  ['jungle', 'Đi rừng', 'Tempo, mục tiêu lớn và nhịp call của cả đội.'],
  ['mid', 'Đường giữa', 'Roam nhanh, kiểm soát mid wave và burst chủ lực.'],
  ['dragon', 'Đường Rồng', 'DPS ổn định, giữ vị trí và chuyển hoá lợi thế.'],
  ['support', 'Trợ thủ', 'Cover chủ lực, mở combat và giữ vision tình huống.'],
] as const;

export default function LaneSelectionScreen() {
  const persistedLaneIds = usePersistedOnboardingDraftStore(
    (state) => state.envelope?.data.laneIds,
  );
  const [selected, setSelected] = useState<string[]>(persistedLaneIds ?? []);
  const [saving, setSaving] = useState(false);

  const toggleLane = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[0]!, id];
      return [...current, id];
    });
  };

  const submit = async () => {
    if (selected.length < 1 || selected.length > 2 || saving) return;
    setSaving(true);
    try {
      await savePersistedOnboardingStep(
        { laneIds: selected },
        'hero_selection',
      );
      router.push(appRoutes.onboarding.heroSelection);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    router.back();
  };

  return (
    <OnboardingCinematicShell
      headerDensity="compact"
      step={3}
      subtitle="Chọn tối đa 2 lane để mọi người hiểu vai trò bạn tự tin nhất khi vào set."
      title="Chọn lane của bạn"
      tone="cyan"
      footer={
        <View>
          <OnboardingPrimaryButton
            disabled={selected.length < 1 || selected.length > 2 || saving}
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
    >
      <View style={styles.list}>
        {lanes.map(([id, name, meta]) => {
          const isSelected = selected.includes(id);
          const isPrimary = selected[0] === id;

          return (
            <OnboardingOptionRow
              key={id}
              meta={meta}
              onPress={() => toggleLane(id)}
              selected={isSelected}
              title={name}
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
