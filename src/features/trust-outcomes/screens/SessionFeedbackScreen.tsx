import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createTrustCreateMetadataForSource,
  createTrustMutationMetadataForSource,
  useConfirmSessionParticipation,
  useDisputeSessionParticipation,
  useSessionFeedbackSurface,
  useSubmitPlayerEndorsement,
} from '@/entities/trust-outcomes';
import { usePlayerIdentities } from '@/entities/player-identity';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import {
  EndorsementKindV2Schema,
  PlaySessionIdSchema,
  type EndorsementKindV2,
  type ParticipationDisputeReasonV2,
} from '@/shared/contracts/core-v2';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

const endorsements: readonly Readonly<{
  kind: EndorsementKindV2;
  label: string;
}>[] = [
  { kind: 'good_communication', label: 'Giao tiếp tốt' },
  { kind: 'on_time', label: 'Đúng giờ' },
  { kind: 'cooperative', label: 'Phối hợp tốt' },
  { kind: 'role_reliable', label: 'Đúng vai trò' },
  { kind: 'positive_attitude', label: 'Thái độ tích cực' },
  { kind: 'would_play_again', label: 'Muốn chơi lại' },
];

const disputes: readonly Readonly<{
  reason: ParticipationDisputeReasonV2;
  label: string;
}>[] = [
  { reason: 'session_did_not_happen', label: 'Buổi chơi không diễn ra' },
  { reason: 'left_before_start', label: 'Rời trước khi bắt đầu' },
  { reason: 'wrong_member_list', label: 'Danh sách thành viên sai' },
  { reason: 'other', label: 'Lý do khác' },
];

export function SessionFeedbackScreen({ sessionId }: { sessionId: string }) {
  const parsedSessionId = PlaySessionIdSchema.safeParse(sessionId);
  const { session } = useAuth();
  const feedbackQuery = useSessionFeedbackSurface(
    session,
    parsedSessionId.success ? parsedSessionId.data : undefined,
  );
  const confirmMutation = useConfirmSessionParticipation(session);
  const disputeMutation = useDisputeSessionParticipation(session);
  const endorsementMutation = useSubmitPlayerEndorsement(session);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] =
    useState<ParticipationDisputeReasonV2>('session_did_not_happen');
  const [disputeNote, setDisputeNote] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedKinds, setSelectedKinds] = useState<EndorsementKindV2[]>([
    'would_play_again',
  ]);
  const surface = feedbackQuery.data;

  const pending =
    confirmMutation.isPending ||
    disputeMutation.isPending ||
    endorsementMutation.isPending;
  const error =
    confirmMutation.error ?? disputeMutation.error ?? endorsementMutation.error;
  const actorStatus = surface?.actorConfirmation?.status ?? null;
  const waitingForOthers =
    actorStatus === 'confirmed' && !surface?.allParticipantsConfirmed;
  const eligibleTargets = surface?.endorsementTargetPlayerIds ?? [];
  const identitiesQuery = usePlayerIdentities(eligibleTargets);
  const identities = useMemo(
    () =>
      new Map(
        (identitiesQuery.data ?? []).map((identity) => [
          identity.playerId,
          identity,
        ]),
      ),
    [identitiesQuery.data],
  );
  const resolvedSelectedTarget = eligibleTargets.includes(
    selectedTarget as never,
  )
    ? selectedTarget
    : (eligibleTargets[0] ?? null);
  const completed =
    actorStatus === 'confirmed' &&
    surface?.allParticipantsConfirmed &&
    eligibleTargets.length === 0;
  const deadlineLabel = useMemo(
    () => formatDeadline(surface?.outcome.confirmationDeadlineAt),
    [surface?.outcome.confirmationDeadlineAt],
  );

  const confirmParticipation = async () => {
    if (!surface || !parsedSessionId.success || pending) return;
    impact();
    try {
      await confirmMutation.mutateAsync({
        ...createTrustMutationMetadataForSource(
          surface.outcome.version,
          'confirm-participation',
          parsedSessionId.data,
        ),
        sessionId: parsedSessionId.data,
      });
    } catch {
      // The mutation retains the authoritative error for the live-region message.
    }
  };

  const disputeParticipation = async () => {
    if (!surface || !parsedSessionId.success || pending) return;
    impact();
    try {
      await disputeMutation.mutateAsync({
        ...createTrustMutationMetadataForSource(
          surface.outcome.version,
          'dispute-participation',
          parsedSessionId.data,
        ),
        ...(disputeNote.trim() ? { note: disputeNote.trim() } : {}),
        reasonCode: disputeReason,
        sessionId: parsedSessionId.data,
      });
      setShowDispute(false);
    } catch {
      // The mutation retains the authoritative error for the live-region message.
    }
  };

  const submitEndorsement = async () => {
    if (
      !surface ||
      !parsedSessionId.success ||
      !resolvedSelectedTarget ||
      selectedKinds.length === 0 ||
      pending
    ) {
      return;
    }
    impact();
    try {
      await endorsementMutation.mutateAsync({
        ...createTrustCreateMetadataForSource(
          'submit-endorsement',
          parsedSessionId.data,
          [resolvedSelectedTarget],
        ),
        expectedOutcomeVersion: surface.outcome.version,
        kinds: selectedKinds,
        sessionId: parsedSessionId.data,
        targetPlayerId: resolvedSelectedTarget as never,
      });
    } catch {
      // The mutation retains the authoritative error for the live-region message.
    }
  };

  if (!parsedSessionId.success) {
    return (
      <LiquidScreen
        contentContainerStyle={styles.centered}
        withBottomNavPadding={false}
        withHeader={false}
      >
        <StateCard title="Liên kết feedback không hợp lệ" />
      </LiquidScreen>
    );
  }

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
          <Text style={styles.eyebrow}>SESSION ĐÃ HOÀN TẤT</Text>
          <Text style={styles.title}>Xác nhận & ghi nhận đồng đội</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {feedbackQuery.isLoading ? (
        <StateCard loading title="Đang tải kết quả buổi chơi..." />
      ) : feedbackQuery.isError || !surface ? (
        <StateCard
          onRetry={() => void feedbackQuery.refetch()}
          title="Chưa tải được phản hồi mới nhất"
        />
      ) : (
        <>
          <LiquidCard density="regular" style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons color="#67E8FF" name="checkmark-done" size={24} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.cardTitle}>Buổi chơi đã được ghi nhận</Text>
              <Text style={styles.body}>
                Hoàn tất {formatDate(surface.outcome.completedAt)} · phản hồi
                trước {deadlineLabel}
              </Text>
            </View>
          </LiquidCard>

          {actorStatus === null ? (
            <LiquidCard density="regular" style={styles.actionCard}>
              <Text style={styles.cardTitle}>
                Bạn có tham gia buổi chơi này?
              </Text>
              <Text style={styles.body}>
                Xác nhận chỉ dựa trên session hoàn tất. Báo vấn đề không tạo
                đánh giá công khai.
              </Text>
              <View style={styles.buttonRow}>
                <LiquidButton
                  disabled={pending}
                  onPress={() => void confirmParticipation()}
                  style={styles.flexButton}
                >
                  {pending ? 'Đang gửi...' : 'Đã tham gia'}
                </LiquidButton>
                <LiquidButton
                  disabled={pending}
                  onPress={() => setShowDispute((value) => !value)}
                  style={styles.flexButton}
                  variant="secondary"
                >
                  Có vấn đề
                </LiquidButton>
              </View>
              {showDispute ? (
                <View style={styles.disputePanel}>
                  <View style={styles.chips}>
                    {disputes.map((item) => (
                      <LiquidChip
                        density="compact"
                        key={item.reason}
                        onPress={() => setDisputeReason(item.reason)}
                        selected={disputeReason === item.reason}
                        variant={
                          disputeReason === item.reason ? 'purple' : 'default'
                        }
                      >
                        {item.label}
                      </LiquidChip>
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel="Chi tiết vấn đề"
                    multiline
                    onChangeText={setDisputeNote}
                    placeholder="Mô tả thêm (không bắt buộc)"
                    placeholderTextColor="rgba(215,224,255,0.35)"
                    style={styles.noteInput}
                    value={disputeNote}
                  />
                  <LiquidButton
                    disabled={pending}
                    onPress={() => void disputeParticipation()}
                    variant="secondary"
                  >
                    Gửi xác minh
                  </LiquidButton>
                </View>
              ) : null}
            </LiquidCard>
          ) : actorStatus === 'disputed' ? (
            <StateCard title="Vấn đề đã được ghi nhận. Session này chưa tạo trust tích cực." />
          ) : waitingForOthers ? (
            <StateCard title="Bạn đã xác nhận. Đang chờ các thành viên còn lại." />
          ) : eligibleTargets.length ? (
            <LiquidCard density="regular" style={styles.actionCard}>
              <Text style={styles.cardTitle}>Ghi nhận đồng đội</Text>
              <Text style={styles.body}>
                Chỉ có lời khen tích cực. Phản hồi tiêu cực đi qua
                dispute/report riêng tư.
              </Text>
              <Text style={styles.label}>Đồng đội</Text>
              <View style={styles.chips}>
                {eligibleTargets.map((playerId) => (
                  <LiquidChip
                    density="compact"
                    key={playerId}
                    onPress={() => setSelectedTarget(playerId)}
                    selected={resolvedSelectedTarget === playerId}
                    variant={selectedTarget === playerId ? 'cyan' : 'default'}
                  >
                    {identities.get(playerId)?.displayName ??
                      (identitiesQuery.isPending
                        ? 'Đang tải đồng đội…'
                        : 'Người chơi Liqi')}
                  </LiquidChip>
                ))}
              </View>
              <Text style={styles.label}>Điểm tích cực</Text>
              <View style={styles.chips}>
                {endorsements.map((item) => {
                  const selected = selectedKinds.includes(item.kind);
                  return (
                    <LiquidChip
                      density="compact"
                      key={item.kind}
                      onPress={() => {
                        setSelectedKinds((current) =>
                          selected
                            ? current.filter((kind) => kind !== item.kind)
                            : EndorsementKindV2Schema.array()
                                .max(6)
                                .parse([...current, item.kind]),
                        );
                      }}
                      selected={selected}
                      variant={selected ? 'purple' : 'default'}
                    >
                      {item.label}
                    </LiquidChip>
                  );
                })}
              </View>
              <LiquidButton
                disabled={!selectedKinds.length || pending}
                onPress={() => void submitEndorsement()}
              >
                {pending ? 'Đang lưu...' : 'Gửi lời khen'}
              </LiquidButton>
            </LiquidCard>
          ) : completed ? (
            <StateCard title="Feedback đã hoàn tất. Trust profile đã được cập nhật từ ledger." />
          ) : null}

          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              Dữ liệu có thể đã thay đổi ở phiên khác. Hãy tải lại và thử lại.
            </Text>
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
      {loading ? <ActivityIndicator color="#67E8FF" /> : null}
      <Text style={styles.cardTitle}>{title}</Text>
      {onRetry ? (
        <LiquidButton onPress={onRetry} variant="secondary">
          Tải lại
        </LiquidButton>
      ) : null}
    </LiquidCard>
  );
}

function impact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function formatDeadline(value: string | undefined) {
  return value ? formatDate(value) : 'không rõ';
}

const styles = StyleSheet.create({
  actionCard: { gap: 14 },
  body: { color: liquidColors.text.secondary, fontSize: 13, lineHeight: 19 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  cardTitle: {
    color: liquidColors.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  centered: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: {
    gap: 16,
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  disputePanel: { gap: 12 },
  errorText: {
    color: '#FFB4A9',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  eyebrow: {
    color: 'rgba(103,232,255,0.68)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  flexButton: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  headerCopy: { alignItems: 'center', flex: 1, gap: 3 },
  headerSpacer: { height: 42, width: 42 },
  label: { color: 'rgba(235,240,255,0.84)', fontSize: 12, fontWeight: '800' },
  noteInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    color: liquidColors.text.primary,
    minHeight: 84,
    padding: 12,
    textAlignVertical: 'top',
  },
  stateCard: { alignItems: 'center', gap: 14 },
  summaryCard: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  summaryCopy: { flex: 1, gap: 4 },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.10)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: liquidColors.text.primary,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});
