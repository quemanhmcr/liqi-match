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
import { updateOnboardingSnapshot } from '../model/onboarding-draft-store';

const ranks = [
  ['bronze', 'Đồng', 'Vừa bắt đầu, ưu tiên set vui và học map.'],
  ['silver', 'Bạc', 'Đã quen nhịp trận, cần đồng đội ổn định.'],
  ['gold', 'Vàng', 'Nắm cơ bản, bắt đầu tối ưu lane và macro.'],
  ['platinum', 'Bạch Kim', 'Có vai trò rõ, cần team cùng gu leo rank.'],
  ['diamond', 'Kim Cương', 'Đọc giao tranh tốt, ưu tiên phối hợp chắc.'],
  ['veteran', 'Tinh Anh', 'Cần đồng đội biết call mục tiêu và giữ tempo.'],
  ['master', 'Cao Thủ', 'Mặc định đề xuất: tín hiệu rank đủ sắc để match.'],
  [
    'grandmaster-iv',
    'Đại Cao Thủ IV',
    'Ưu tiên team nghiêm túc, vào set nhanh.',
  ],
  [
    'grandmaster-iii',
    'Đại Cao Thủ III',
    'Đồng đội cần cùng nhịp combat và macro.',
  ],
  [
    'grandmaster-ii',
    'Đại Cao Thủ II',
    'Match theo chất lượng phối hợp, không spam.',
  ],
  ['grandmaster-i', 'Đại Cao Thủ I', 'Tệp người chơi cao, kỳ vọng call rõ.'],
  ['conqueror', 'Chiến Tướng', 'Ghép đội cạnh tranh, giữ performance ổn định.'],
  ['legendary', 'Chiến Thần', 'Hồ sơ nổi bật, ưu tiên match chuẩn gu cao.'],
] as const;

export default function RankSelectionScreen() {
  const [selected, setSelected] = useState('master');

  const submit = () => {
    updateOnboardingSnapshot({ rankId: selected });
    router.push(appRoutes.onboarding.lane);
  };

  const goBack = () => {
    router.back();
  };

  return (
    <OnboardingCinematicShell
      headerDensity="compact"
      step={2}
      subtitle="Chọn mức rank gần nhất để Liqi ghép bạn với đúng nhịp leo rank và kỳ vọng đồng đội."
      title="Chọn mức rank hiện tại"
      tone="purple"
      footer={
        <View>
          <OnboardingPrimaryButton onPress={submit}>
            Tiếp tục
          </OnboardingPrimaryButton>
          <OnboardingSecondaryAction onPress={goBack}>
            Quay lại
          </OnboardingSecondaryAction>
        </View>
      }
    >
      <View style={styles.list}>
        {ranks.map(([id, name, meta]) => (
          <OnboardingOptionRow
            key={id}
            meta={meta}
            onPress={() => setSelected(id)}
            selected={selected === id}
            title={name}
            trailing={
              selected === id ? (
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
