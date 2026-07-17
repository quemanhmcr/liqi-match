import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  createTrustMutationMetadataForSource,
  useEngagementPreferences,
  useUpdateEngagementPreferences,
} from '@/entities/trust-outcomes';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import type { EngagementPreferencesV2 } from '@/shared/contracts/core-v2';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

type BooleanPreferenceKey =
  | 'activityEnabled'
  | 'feedbackPromptsEnabled'
  | 'pushReactivationEnabled'
  | 'repeatPlayPromptsEnabled';

const definitions: readonly Readonly<{
  icon: keyof typeof Ionicons.glyphMap;
  key: BooleanPreferenceKey;
  subtitle: string;
  title: string;
}>[] = [
  {
    icon: 'sparkles-outline',
    key: 'activityEnabled',
    subtitle: 'Hiển thị các việc cần xử lý và tiến trình trust trong ứng dụng.',
    title: 'Hoạt động cá nhân',
  },
  {
    icon: 'checkmark-done-outline',
    key: 'feedbackPromptsEnabled',
    subtitle: 'Nhắc xác nhận tham gia và ghi nhận đồng đội sau session.',
    title: 'Nhắc phản hồi session',
  },
  {
    icon: 'repeat-outline',
    key: 'repeatPlayPromptsEnabled',
    subtitle: 'Chỉ đề xuất chơi lại khi cả hai người vẫn đủ điều kiện.',
    title: 'Gợi ý chơi lại',
  },
  {
    icon: 'notifications-outline',
    key: 'pushReactivationEnabled',
    subtitle: 'Cho phép gửi push tái kích hoạt trong giới hạn bạn chọn.',
    title: 'Push tái kích hoạt',
  },
];

export function EngagementPreferencesScreen() {
  const { session } = useAuth();
  const preferencesQuery = useEngagementPreferences(session);
  const updateMutation = useUpdateEngagementPreferences(session);
  const preferences = preferencesQuery.data;

  const save = async (next: EngagementPreferencesV2) => {
    if (!preferences || updateMutation.isPending) return;
    void Haptics.selectionAsync().catch(() => undefined);
    try {
      await updateMutation.mutateAsync({
        ...createTrustMutationMetadataForSource(
          preferences.version,
          'update-engagement-preferences',
          preferences.playerId,
          [String(next.maxReactivationNotificationsPerDay)],
        ),
        preferences: {
          activityEnabled: next.activityEnabled,
          feedbackPromptsEnabled: next.feedbackPromptsEnabled,
          maxReactivationNotificationsPerDay:
            next.maxReactivationNotificationsPerDay,
          pushReactivationEnabled: next.pushReactivationEnabled,
          repeatPlayPromptsEnabled: next.repeatPlayPromptsEnabled,
        },
      });
    } catch (error) {
      Alert.alert(
        'Chưa lưu được nhắc nhở',
        error instanceof Error
          ? error.message
          : 'Dữ liệu có thể đã thay đổi. Hãy tải lại và thử lại.',
      );
      await preferencesQuery.refetch();
    }
  };

  return (
    <LiquidScreen
      contentContainerStyle={styles.content}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.header}>
        <LiquidOrbButton
          accessibilityLabel="Quay lại"
          onPress={() => router.back()}
          size={42}
        >
          <Ionicons
            color={liquidColors.text.primary}
            name="chevron-back"
            size={20}
          />
        </LiquidOrbButton>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>RETURN LOOP V2</Text>
          <Text style={styles.title}>Nhắc nhở & hoạt động</Text>
        </View>
        <View style={styles.spacer} />
      </View>

      <LiquidCard density="regular" style={styles.intro} variant="purple">
        <Ionicons color="#67E8FF" name="options-outline" size={24} />
        <View style={styles.introCopy}>
          <Text style={styles.cardTitle}>Bạn kiểm soát nhịp quay lại</Text>
          <Text style={styles.body}>
            Các lựa chọn này áp dụng cho thông báo của bạn; tắt một loại nhắc sẽ
            ngăn consumer tương ứng tạo delivery mới.
          </Text>
        </View>
      </LiquidCard>

      {preferencesQuery.isPending ? (
        <StateCard loading title="Đang tải chính sách nhắc nhở..." />
      ) : preferencesQuery.isError || !preferences ? (
        <StateCard
          onRetry={() => void preferencesQuery.refetch()}
          title="Chưa tải được engagement preferences"
        />
      ) : (
        <>
          <View style={styles.rows}>
            {definitions.map((definition) => (
              <LiquidCard
                density="list"
                key={definition.key}
                style={styles.rowCard}
              >
                <View style={styles.row}>
                  <View style={styles.iconShell}>
                    <Ionicons
                      color="rgba(178,235,255,0.82)"
                      name={definition.icon}
                      size={18}
                    />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{definition.title}</Text>
                    <Text style={styles.rowSubtitle}>
                      {definition.subtitle}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={definition.title}
                    disabled={updateMutation.isPending}
                    onValueChange={(value) =>
                      void save({ ...preferences, [definition.key]: value })
                    }
                    value={preferences[definition.key]}
                  />
                </View>
              </LiquidCard>
            ))}
          </View>

          <LiquidCard density="regular" style={styles.capCard}>
            <Text style={styles.cardTitle}>Giới hạn push mỗi ngày</Text>
            <Text style={styles.body}>
              Tối đa số push tái kích hoạt trong một ngày. Giá trị 0 tắt
              delivery nhưng vẫn giữ activity trong ứng dụng nếu được bật.
            </Text>
            <View style={styles.caps}>
              {[0, 1, 2, 3, 4].map((value) => (
                <LiquidChip
                  accessibilityLabel={`${value} push mỗi ngày`}
                  density="compact"
                  disabled={updateMutation.isPending}
                  key={value}
                  onPress={() =>
                    void save({
                      ...preferences,
                      maxReactivationNotificationsPerDay: value,
                    })
                  }
                  selected={
                    preferences.maxReactivationNotificationsPerDay === value
                  }
                  variant={
                    preferences.maxReactivationNotificationsPerDay === value
                      ? 'cyan'
                      : 'default'
                  }
                >
                  {value === 0 ? 'Tắt' : `${value}/ngày`}
                </LiquidChip>
              ))}
            </View>
          </LiquidCard>
          {updateMutation.isPending ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color="#67E8FF" size="small" />
              <Text style={styles.body}>Đang lưu policy phiên bản mới...</Text>
            </View>
          ) : null}
        </>
      )}
    </LiquidScreen>
  );
}

function StateCard({
  loading = false,
  onRetry,
  title,
}: {
  loading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiquidCard density="regular" style={styles.stateCard}>
      {loading ? (
        <ActivityIndicator color="#67E8FF" />
      ) : (
        <Ionicons color="#FFCB8D" name="alert-circle-outline" size={24} />
      )}
      <Text style={styles.body}>{title}</Text>
      {onRetry ? (
        <LiquidButton onPress={onRetry} variant="secondary">
          Tải lại
        </LiquidButton>
      ) : null}
    </LiquidCard>
  );
}

const styles = StyleSheet.create({
  body: { color: liquidColors.text.secondary, fontSize: 12.5, lineHeight: 18 },
  capCard: { gap: 10 },
  caps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardTitle: {
    color: liquidColors.text.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  content: { gap: 14, paddingBottom: 36, paddingHorizontal: 16, paddingTop: 8 },
  eyebrow: {
    color: 'rgba(103,232,255,0.66)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  headerCopy: { alignItems: 'center', flex: 1, gap: 3 },
  iconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.08)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  intro: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  introCopy: { flex: 1, gap: 3 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  rowCard: { overflow: 'hidden' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowSubtitle: {
    color: liquidColors.text.muted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  rowTitle: {
    color: liquidColors.text.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  rows: { gap: 9 },
  savingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
  },
  spacer: { height: 42, width: 42 },
  stateCard: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    minHeight: 150,
  },
  title: { color: liquidColors.text.primary, fontSize: 17, fontWeight: '900' },
});
