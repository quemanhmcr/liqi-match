import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { RANK_CATALOG, type RankId } from '@/entities/player-profile';
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

const rankDescriptions: Record<RankId, string> = {
  bronze: 'Vừa bắt đầu, ưu tiên set vui và học map.',
  conqueror: 'Ghép đội cạnh tranh, giữ performance ổn định.',
  diamond: 'Đọc giao tranh tốt, ưu tiên phối hợp chắc.',
  gold: 'Nắm cơ bản, bắt đầu tối ưu lane và macro.',
  'grandmaster-i': 'Tệp người chơi cao, kỳ vọng call rõ.',
  'grandmaster-ii': 'Match theo chất lượng phối hợp, không spam.',
  'grandmaster-iii': 'Đồng đội cần cùng nhịp combat và macro.',
  'grandmaster-iv': 'Ưu tiên team nghiêm túc, vào set nhanh.',
  iron: 'Đang làm quen, ưu tiên đồng đội kiên nhẫn.',
  legendary: 'Hồ sơ nổi bật, ưu tiên match chuẩn gu cao.',
  master: 'Tín hiệu rank đủ sắc để match đúng kỳ vọng.',
  platinum: 'Có vai trò rõ, cần team cùng gu leo rank.',
  silver: 'Đã quen nhịp trận, cần đồng đội ổn định.',
  veteran: 'Cần đồng đội biết call mục tiêu và giữ tempo.',
};

export default function RankSelectionScreen() {
  const persistedRankId = usePersistedOnboardingDraftStore(
    (state) => state.envelope?.data.profile.rankId,
  );
  const [selected, setSelected] = useState<RankId | null>(
    persistedRankId ?? null,
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await savePersistedOnboardingStep({ rankId: selected }, 'lane');
      router.push(appRoutes.onboarding.lane);
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingCinematicShell
      footer={
        <View>
          <OnboardingPrimaryButton
            disabled={!selected || saving}
            onPress={() => void submit()}
          >
            Tiếp tục
          </OnboardingPrimaryButton>
          <OnboardingSecondaryAction onPress={() => router.back()}>
            Quay lại
          </OnboardingSecondaryAction>
        </View>
      }
      headerDensity="compact"
      step={2}
      subtitle="Chọn mức rank gần nhất để Liqi ghép bạn với đúng nhịp leo rank và kỳ vọng đồng đội."
      title="Chọn mức rank hiện tại"
      tone="purple"
    >
      <View style={styles.list}>
        {RANK_CATALOG.map((option) => (
          <OnboardingOptionRow
            key={option.id}
            meta={rankDescriptions[option.id]}
            onPress={() => setSelected(option.id)}
            selected={selected === option.id}
            title={option.label}
            trailing={
              selected === option.id ? (
                <Text style={styles.selectedMark}>✓</Text>
              ) : null
            }
          />
        ))}
      </View>
    </OnboardingCinematicShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: 7, paddingTop: 11 },
  selectedMark: {
    color: 'rgba(204,151,255,0.58)',
    fontSize: 12,
    fontWeight: '500',
  },
});
