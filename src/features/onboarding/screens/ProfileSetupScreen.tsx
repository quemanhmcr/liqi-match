import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  GENDER_CATALOG,
  PROFILE_LIMITS,
  type GenderId,
} from '@/entities/player-profile';
import {
  OnboardingCinematicShell,
  OnboardingPrimaryButton,
  OnboardingSection,
} from '@/features/onboarding/components/OnboardingCinematic';

import {
  savePersistedOnboardingStep,
  usePersistedOnboardingDraftStore,
} from '../model/persisted-onboarding-draft';

const genderVisuals: Record<GenderId, { icon: string; meta: string }> = {
  female: { icon: '♀', meta: '' },
  hidden: { icon: '☆', meta: 'Không muốn tiết lộ' },
  male: { icon: '♂', meta: '' },
};

export default function ProfileSetupScreen() {
  const initialBasics = usePersistedOnboardingDraftStore(
    (state) => state.envelope?.data.profile.profileBasics,
  );
  const [displayName, setDisplayName] = useState(
    initialBasics?.displayName ?? '',
  );
  const [gameHandle, setGameHandle] = useState(initialBasics?.gameHandle ?? '');
  const [gender, setGender] = useState<GenderId | null>(
    initialBasics?.genderId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canContinue =
    displayName.trim().length >= 2 &&
    gameHandle.trim().length >= 2 &&
    Boolean(gender) &&
    !saving;

  const saveAndContinue = async () => {
    if (!canContinue || !gender) return;
    setSaving(true);
    setSaveError(null);
    try {
      await savePersistedOnboardingStep(
        {
          profileBasics: {
            displayName: displayName.trim(),
            gameHandle: gameHandle.trim(),
            genderId: gender,
          },
        },
        'rank',
      );
      router.push(appRoutes.onboarding.rank);
    } catch {
      setSaveError('Không thể lưu tiến độ. Vui lòng thử lại.');
      setSaving(false);
    }
  };

  return (
    <OnboardingCinematicShell
      contentContainerStyle={styles.content}
      footer={
        <OnboardingPrimaryButton
          disabled={!canContinue}
          onPress={() => void saveAndContinue()}
        >
          Tiếp tục
        </OnboardingPrimaryButton>
      }
      headerDensity="compact"
      step={1}
      subtitle="Tên hiển thị và tên trong game là hai tín hiệu riêng để đồng đội nhận ra bạn chính xác."
      title="Tạo hồ sơ"
      tone="purple"
    >
      <View style={styles.stack}>
        <ProfileTextInput
          hint="Hiển thị trong hồ sơ và box chat."
          icon="♙"
          maxLength={PROFILE_LIMITS.displayName}
          onChangeText={setDisplayName}
          placeholder="Nhập tên hiển thị"
          title="Tên hiển thị"
          value={displayName}
        />
        <ProfileTextInput
          hint="Tên tài khoản hoặc tên nhân vật mà đồng đội sẽ tìm trong game."
          icon="⌁"
          maxLength={PROFILE_LIMITS.gameHandle}
          onChangeText={setGameHandle}
          placeholder="Nhập tên trong game"
          title="Tên trong game"
          value={gameHandle}
        />

        <OnboardingSection title="Giới tính">
          <View style={styles.genderGrid}>
            {GENDER_CATALOG.map((option) => {
              const selected = option.id === gender;
              const visual = genderVisuals[option.id];
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
                      {visual.icon}
                    </Text>
                    <Text style={styles.genderLabel}>{option.label}</Text>
                    {visual.meta ? (
                      <Text style={styles.genderMeta}>{visual.meta}</Text>
                    ) : null}
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        </OnboardingSection>
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </View>
    </OnboardingCinematicShell>
  );
}

function ProfileTextInput({
  hint,
  icon,
  maxLength,
  onChangeText,
  placeholder,
  title,
  value,
}: {
  hint: string;
  icon: string;
  maxLength: number;
  onChangeText: (value: string) => void;
  placeholder: string;
  title: string;
  value: string;
}) {
  return (
    <OnboardingSection title={title}>
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
          <Text style={styles.inputIcon}>{icon}</Text>
          <TextInput
            autoCapitalize="words"
            maxLength={maxLength}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="rgba(222,228,251,0.26)"
            returnKeyType="done"
            style={styles.input}
            value={value}
          />
        </View>
      </View>
      <View style={styles.nameMetaRow}>
        <Text style={styles.inputHint}>{hint}</Text>
        <Text style={styles.counter}>
          {value.length}/{maxLength}
        </Text>
      </View>
    </OnboardingSection>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  counter: {
    color: 'rgba(222,228,251,0.34)',
    fontSize: 10.8,
    fontWeight: '500',
  },
  error: {
    color: '#FF9AAB',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
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
    justifyContent: 'center',
    minHeight: 88,
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
  inputFrame: { borderRadius: 22, minHeight: 47, overflow: 'hidden' },
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
