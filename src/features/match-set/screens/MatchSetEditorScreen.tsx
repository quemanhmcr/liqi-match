import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  useMatchSetCommandMutation,
  useMatchSetDetailQuery,
} from '@/entities/match-set';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
} from '@/shared/components/liquid';
import { SetIdSchema } from '@/shared/contracts/core-v1';
import type { MatchSetSnapshotV2 } from '@/shared/contracts/core-v2';
import { prepareCoreV2CommandMetadata } from '@/shared/core-v2';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

type IntentId = 'normal' | 'rank' | 'set_love' | 'soulmate' | 'team_rank';
type ExpiryId = 'day' | 'none' | 'week';

const intents: readonly { id: IntentId; label: string; subtitle: string }[] = [
  { id: 'set_love', label: 'Set Love', subtitle: 'Tìm nhóm hợp gu lâu dài' },
  { id: 'rank', label: 'Leo hạng', subtitle: 'Tập trung mục tiêu xếp hạng' },
  { id: 'team_rank', label: 'Lập đội', subtitle: 'Xây đội hình ổn định' },
  { id: 'normal', label: 'Thoải mái', subtitle: 'Chơi vui, lịch linh hoạt' },
  {
    id: 'soulmate',
    label: 'Hợp gu',
    subtitle: 'Ưu tiên phong cách tương đồng',
  },
];

export function MatchSetEditorScreen({ setId }: { setId?: string }) {
  const parsedSetId = SetIdSchema.safeParse(setId);
  const editing = Boolean(setId);
  const detail = useMatchSetDetailQuery(
    editing && parsedSetId.success ? parsedSetId.data : undefined,
  );

  if (editing && !parsedSetId.success) {
    return (
      <EditorState
        description="Liên kết Set không hợp lệ hoặc đã bị thay đổi."
        title="Không thể mở Set"
      />
    );
  }
  if (editing && detail.isLoading) {
    return (
      <EditorState
        description="Đang lấy snapshot mới nhất trước khi cho phép chỉnh sửa."
        loading
        title="Đang tải Set…"
      />
    );
  }
  if (editing && (detail.error || !detail.data)) {
    return (
      <EditorState
        description="Chưa thể tải trạng thái mới nhất của Set. Biểu mẫu tạm thời bị khoá để tránh ghi đè dữ liệu mới."
        onRetry={() => void detail.refetch()}
        title="Chưa thể tải Set"
      />
    );
  }

  const snapshot = editing ? (detail.data ?? undefined) : undefined;
  return (
    <MatchSetEditorForm
      key={snapshot ? `${snapshot.setId}:${snapshot.version}` : 'create'}
      snapshot={snapshot}
    />
  );
}

function MatchSetEditorForm({ snapshot }: { snapshot?: MatchSetSnapshotV2 }) {
  const editing = Boolean(snapshot);
  const [title, setTitle] = useState(snapshot?.title ?? 'Team tối nay');
  const [intentKind, setIntentKind] = useState<IntentId>(() =>
    snapshot && intents.some((intent) => intent.id === snapshot.intentKind)
      ? (snapshot.intentKind as IntentId)
      : snapshot
        ? 'normal'
        : 'set_love',
  );
  const [capacity, setCapacity] = useState(snapshot?.capacity ?? 3);
  const [expiry, setExpiry] = useState<ExpiryId>(() =>
    snapshot ? expiryFromSnapshot(snapshot.expiresAt) : 'week',
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const create = useMatchSetCommandMutation(
    (
      repository,
      session,
      input: {
        capacity: number;
        expiresAt: string | null;
        intentKind: IntentId;
        title: string;
      },
    ) =>
      repository.createSet(session, {
        ...prepareCoreV2CommandMetadata(0, { idempotencyScope: 'set-create' }),
        ...input,
      }),
    {
      onSuccess: (receipt) =>
        router.replace(appRoutes.sets.detail(receipt.aggregateId)),
    },
  );
  const update = useMatchSetCommandMutation(
    (
      repository,
      session,
      input: {
        capacity: number;
        expiresAt: string | null;
        intentKind: IntentId;
        setId: string;
        title: string;
        version: number;
      },
    ) =>
      repository.updateSet(session, {
        ...prepareCoreV2CommandMetadata(input.version, {
          idempotencyScope: 'set-update',
        }),
        capacity: input.capacity,
        expiresAt: input.expiresAt,
        intentKind: input.intentKind,
        setId: input.setId as never,
        title: input.title,
      }),
    {
      onSuccess: (receipt) =>
        router.replace(appRoutes.sets.detail(receipt.aggregateId)),
    },
  );

  const submit = () => {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length < 2) {
      setValidationError('Tên Set cần ít nhất 2 ký tự.');
      return;
    }
    const expiresAt = expiryValue(expiry);
    setValidationError(null);
    if (snapshot) {
      const activeCount = snapshot.members.filter(
        (member) => member.state === 'active',
      ).length;
      if (capacity < activeCount) {
        setValidationError(
          `Set đang có ${activeCount} thành viên, không thể giảm thấp hơn.`,
        );
        return;
      }
      update.mutate({
        capacity,
        expiresAt,
        intentKind,
        setId: snapshot.setId,
        title: normalizedTitle,
        version: snapshot.version,
      });
      return;
    }
    create.mutate({ capacity, expiresAt, intentKind, title: normalizedTitle });
  };

  const pending = create.isPending || update.isPending;
  return (
    <LiquidScreen
      contentContainerStyle={styles.screen}
      subtitle={
        editing
          ? 'Cập nhật mục tiêu và quy mô đội'
          : 'Tạo một nơi ổn định để cùng chơi'
      }
      title={editing ? 'Chỉnh sửa Set' : 'Set mới'}
      withBottomNavPadding={false}
    >
      <LiquidCard contentStyle={styles.card} radius={26} variant="purple">
        <FieldLabel icon="text-outline" label="Tên đội" />
        <TextInput
          accessibilityLabel="Tên Set"
          maxLength={80}
          onChangeText={(value) => {
            setTitle(value);
            setValidationError(null);
          }}
          placeholder="Ví dụ: Team tối nay"
          placeholderTextColor="rgba(210,220,244,0.36)"
          style={styles.input}
          value={title}
        />

        <FieldLabel icon="sparkles-outline" label="Mục tiêu chơi" />
        <View style={styles.intentGrid}>
          {intents.map((intent) => (
            <LiquidChip
              accessibilityLabel={`${intent.label}: ${intent.subtitle}`}
              key={intent.id}
              onPress={() => setIntentKind(intent.id)}
              selected={intentKind === intent.id}
              style={styles.intentChip}
              variant="purple"
            >
              {intent.label}
            </LiquidChip>
          ))}
        </View>

        <FieldLabel icon="people-outline" label="Số thành viên tối đa" />
        <View style={styles.optionsRow}>
          {[2, 3, 4, 5].map((value) => (
            <LiquidChip
              key={value}
              onPress={() => setCapacity(value)}
              selected={capacity === value}
              variant="cyan"
            >
              {value} người
            </LiquidChip>
          ))}
        </View>

        <FieldLabel icon="time-outline" label="Thời gian tuyển thành viên" />
        <View style={styles.optionsRow}>
          {(
            [
              ['day', '24 giờ'],
              ['week', '7 ngày'],
              ['none', 'Không giới hạn'],
            ] as const
          ).map(([value, label]) => (
            <LiquidChip
              key={value}
              onPress={() => setExpiry(value)}
              selected={expiry === value}
              variant="purple"
            >
              {label}
            </LiquidChip>
          ))}
        </View>
      </LiquidCard>

      <LiquidCard
        contentStyle={styles.note}
        density="compact"
        radius={20}
        variant="cyan"
        withShadow={false}
      >
        <Ionicons color="#9BDFF2" name="shield-checkmark-outline" size={18} />
        <Text style={styles.noteText}>
          Lời mời, yêu cầu tham gia và thay đổi thành viên luôn được kiểm tra
          lại bằng trạng thái mới nhất của Set.
        </Text>
      </LiquidCard>

      {validationError || create.error || update.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {validationError ??
            'Dữ liệu vừa thay đổi hoặc Set chưa thể lưu. Hãy kiểm tra lại.'}
        </Text>
      ) : null}
      <LiquidButton disabled={pending} onPress={submit} variant="primary">
        {pending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo Set'}
      </LiquidButton>
      <LiquidButton onPress={() => router.back()} variant="ghost">
        Huỷ
      </LiquidButton>
    </LiquidScreen>
  );
}

function EditorState({
  description,
  loading = false,
  onRetry,
  title,
}: {
  description: string;
  loading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiquidScreen
      contentContainerStyle={styles.screen}
      subtitle={description}
      title={title}
      withBottomNavPadding={false}
    >
      <LiquidCard contentStyle={styles.errorCard} radius={22} variant="purple">
        <Ionicons
          color={loading ? '#9BDFF2' : '#FFB9C5'}
          name={loading ? 'sync-outline' : 'alert-circle-outline'}
          size={24}
        />
        <Text style={styles.stateText}>{description}</Text>
        {onRetry ? (
          <LiquidButton onPress={onRetry} variant="secondary">
            Tải lại
          </LiquidButton>
        ) : null}
        {!loading ? (
          <LiquidButton onPress={() => router.back()} variant="ghost">
            Quay lại
          </LiquidButton>
        ) : null}
      </LiquidCard>
    </LiquidScreen>
  );
}

function FieldLabel({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.labelRow}>
      <Ionicons color="#CBB6FF" name={icon} size={16} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function expiryValue(expiry: ExpiryId) {
  if (expiry === 'none') return null;
  const date = new Date();
  date.setHours(date.getHours() + (expiry === 'day' ? 24 : 24 * 7));
  return date.toISOString();
}

function expiryFromSnapshot(value: string | null): ExpiryId {
  if (!value) return 'none';
  return Date.parse(value) - Date.now() <= 36 * 60 * 60 * 1000 ? 'day' : 'week';
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18 },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorCard: { alignItems: 'center', gap: 12, padding: 16 },
  input: {
    backgroundColor: 'rgba(7,11,25,0.46)',
    borderColor: 'rgba(197,176,255,0.16)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#F8F6FF',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  intentChip: { flexGrow: 1 },
  intentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: '#F0EBFF', fontSize: 13, fontWeight: '800' },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  note: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    padding: 13,
  },
  noteText: {
    color: 'rgba(214,224,245,0.64)',
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
  },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  screen: { gap: 14 },
  stateText: {
    color: 'rgba(215,224,244,0.60)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
