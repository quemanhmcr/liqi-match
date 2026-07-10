import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  OnboardingCinematicShell,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
  OnboardingSection,
} from '@/features/onboarding/components/OnboardingCinematic';
import { appRoutes } from '@/app-shell/navigation/routes';
import {
  getOnboardingSnapshot,
  updateOnboardingSnapshot,
  type ProfileGender,
} from '../model/onboarding-draft-store';

const MAX_NAME_LENGTH = 20;

const genderOptions = [
  {
    id: 'male',
    icon: '♂',
    label: 'Nam',
    meta: '',
  },
  {
    id: 'female',
    icon: '♀',
    label: 'Nữ',
    meta: '',
  },
  {
    id: 'hidden',
    icon: '☆',
    label: 'Khác',
    meta: 'Không muốn tiết lộ',
  },
] as const satisfies readonly {
  id: ProfileGender;
  icon: string;
  label: string;
  meta: string;
}[];

export default function ProfileSetupScreen() {
  const initialBasics = getOnboardingSnapshot().profileBasics;
  const [displayName, setDisplayName] = useState(initialBasics.displayName);
  const [gender, setGender] = useState<ProfileGender>(initialBasics.gender);

  const saveAndContinue = (skipName = false) => {
    const nextName = skipName ? '' : displayName.trim();
    updateOnboardingSnapshot({
      profileBasics: {
        displayName: nextName,
        gender,
      },
    });
    router.push(appRoutes.onboarding.rank);
  };

  return (
    <OnboardingCinematicShell
      footer={
        <View>
          <OnboardingPrimaryButton onPress={() => saveAndContinue()}>
            Tiếp tục
          </OnboardingPrimaryButton>
          <OnboardingSecondaryAction onPress={() => saveAndContinue(true)}>
            Để sau
          </OnboardingSecondaryAction>
        </View>
      }
      contentContainerStyle={styles.content}
      headerDensity="compact"
      step={1}
      subtitle="Chỉ vài thông tin để mọi người dễ nhận ra bạn hơn."
      title="Tạo hồ sơ"
      tone="purple"
    >
      <View style={styles.stack}>
        <OnboardingSection title="Tên hiển thị">
          <View style={styles.inputFrame}>
            <LinearGradient
              colors={[
                'rgba(143,181,255,0.09)',
                'rgba(166,76,255,0.08)',
                'rgba(5,10,24,0.28)',
              ]}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.inputInner}>
              <Text style={styles.inputIcon}>♙</Text>
              <TextInput
                autoCapitalize="words"
                maxLength={MAX_NAME_LENGTH}
                onChangeText={setDisplayName}
                placeholder="Nhập tên của bạn"
                placeholderTextColor="rgba(222,228,251,0.26)"
                returnKeyType="done"
                style={styles.input}
                value={displayName}
              />
            </View>
          </View>
          <View style={styles.nameMetaRow}>
            <Text style={styles.inputHint}>
              Hiển thị trong hồ sơ và box chat.
            </Text>
            <Text style={styles.counter}>
              {displayName.length}/{MAX_NAME_LENGTH}
            </Text>
          </View>
        </OnboardingSection>

        <OnboardingSection title="Giới tính">
          <View style={styles.genderGrid}>
            {genderOptions.map((option) => {
              const selected = option.id === gender;

              return (
                <Pressable
                  accessibilityLabel={`Chọn giới tính ${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.id}
                  onPress={() => setGender(option.id)}
                  style={({ pressed }) => [
                    styles.genderCard,
                    selected && styles.genderCardActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <LinearGradient
                    colors={
                      selected
                        ? ['rgba(122,67,198,0.075)', 'rgba(42,55,118,0.018)']
                        : ['rgba(255,255,255,0.045)', 'rgba(255,255,255,0.014)']
                    }
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={styles.genderGradient}
                  >
                    {selected ? (
                      <View style={styles.genderCheck}>
                        <Text style={styles.genderCheckText}>✓</Text>
                      </View>
                    ) : null}
                    <Text
                      style={[
                        styles.genderIcon,
                        option.id === 'female' && styles.genderIconPink,
                        option.id === 'hidden' && styles.genderIconCyan,
                      ]}
                    >
                      {option.icon}
                    </Text>
                    <Text style={styles.genderLabel}>{option.label}</Text>
                    {option.meta ? (
                      <Text style={styles.genderMeta}>{option.meta}</Text>
                    ) : null}
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        </OnboardingSection>
      </View>
    </OnboardingCinematicShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 8,
  },
  counter: {
    color: 'rgba(222,228,251,0.34)',
    fontSize: 10.8,
    fontWeight: '500',
  },
  genderCard: {
    borderRadius: 19,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  genderCardActive: {
    shadowColor: '#A65CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
  },
  genderCheck: {
    alignItems: 'center',
    backgroundColor: 'rgba(157,82,255,0.46)',
    borderRadius: 999,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 16,
  },
  genderCheckText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' },
  genderGradient: {
    alignItems: 'center',
    borderColor: 'rgba(160,178,230,0.075)',
    borderRadius: 19,
    borderWidth: 1,
    minHeight: 88,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 8,
  },
  genderGrid: { flexDirection: 'row', gap: 8 },
  genderIcon: {
    color: 'rgba(146,112,255,0.84)',
    fontSize: 27,
    fontWeight: '300',
    lineHeight: 30,
  },
  genderIconCyan: { color: 'rgba(130,201,255,0.78)' },
  genderIconPink: { color: 'rgba(244,143,211,0.78)' },
  genderLabel: {
    color: 'rgba(248,250,255,0.90)',
    fontSize: 12.8,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  genderMeta: {
    color: 'rgba(222,228,251,0.42)',
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 11.2,
    marginTop: 2,
    textAlign: 'center',
  },
  input: {
    color: 'rgba(248,250,255,0.92)',
    flex: 1,
    fontSize: 14.2,
    fontWeight: '400',
    paddingVertical: 0,
  },
  inputFrame: {
    borderRadius: 22,
    minHeight: 47,
    overflow: 'hidden',
  },
  inputHint: {
    color: 'rgba(222,228,251,0.44)',
    flex: 1,
    fontSize: 10.9,
    fontWeight: '500',
    lineHeight: 14.6,
  },
  inputIcon: {
    color: 'rgba(222,228,251,0.52)',
    fontSize: 17,
    lineHeight: 20,
  },
  inputInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(5,9,22,0.34)',
    borderColor: 'rgba(222,228,251,0.06)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 47,
    paddingHorizontal: 14,
  },
  nameMetaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  stack: { gap: 8, paddingTop: 9 },
});
