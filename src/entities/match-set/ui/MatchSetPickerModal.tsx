import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useMatchSetCommandMutation,
  useMatchSetDashboardQuery,
} from '../match-set-queries';
import { useAuth } from '@/shared/auth/auth-context';
import { prepareCoreV2CommandMetadata } from '@/shared/core-v2';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';

export type MatchSetPickerModalProps = Readonly<{
  onClose: () => void;
  targetDisplayName: string;
  targetPlayerId: string;
  visible: boolean;
}>;

export function MatchSetPickerModal({
  onClose,
  targetDisplayName,
  targetPlayerId,
  visible,
}: MatchSetPickerModalProps) {
  const { session } = useAuth();
  const dashboard = useMatchSetDashboardQuery({ enabled: visible });
  const invite = useMatchSetCommandMutation(
    (repository, currentSession, input: { setId: string; version: number }) =>
      repository.inviteToSet(currentSession, {
        ...prepareCoreV2CommandMetadata(input.version, {
          idempotencyScope: 'set-invite',
        }),
        setId: input.setId as never,
        targetPlayerId: targetPlayerId as never,
      }),
    { onSuccess: onClose },
  );
  const viewerPlayerId = session?.principal?.playerId;
  const availableSets = (dashboard.data?.sets ?? []).filter(
    (set) =>
      set.ownerPlayerId === viewerPlayerId &&
      ['open', 'full'].includes(set.state) &&
      !set.members.some(
        (member) =>
          member.playerId === targetPlayerId && member.state === 'active',
      ),
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Đóng danh sách Set"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <LiquidCard
          contentStyle={styles.card}
          radius={30}
          style={styles.frame}
          surfaceBackground="rgba(12,16,32,0.98)"
          variant="purple"
        >
          <View style={styles.handle} />
          <View style={styles.heading}>
            <View style={styles.headingIcon}>
              <Ionicons color="#D9C6FF" name="people-outline" size={21} />
            </View>
            <View style={styles.headingCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                Mời {targetDisplayName} vào Set
              </Text>
              <Text style={styles.subtitle}>
                Chọn một Set bạn đang quản lý. Quyền tham gia sẽ được kiểm tra
                lại khi gửi.
              </Text>
            </View>
          </View>

          {dashboard.isLoading ? (
            <Text style={styles.stateText}>Đang tải Set của bạn…</Text>
          ) : availableSets.length ? (
            <View style={styles.list}>
              {availableSets.map((set) => {
                const activeCount = set.members.filter(
                  (member) => member.state === 'active',
                ).length;
                const pending =
                  invite.isPending && invite.variables?.setId === set.setId;
                return (
                  <View key={set.setId} style={styles.row}>
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={styles.setTitle}>
                        {set.title}
                      </Text>
                      <Text style={styles.setMeta}>
                        {activeCount}/{set.capacity} thành viên ·{' '}
                        {intentLabel(set.intentKind)}
                      </Text>
                    </View>
                    <LiquidButton
                      disabled={invite.isPending || set.state === 'full'}
                      onPress={() =>
                        invite.mutate({
                          setId: set.setId,
                          version: set.version,
                        })
                      }
                      variant={set.state === 'full' ? 'ghost' : 'primary'}
                    >
                      {set.state === 'full'
                        ? 'Đã đủ'
                        : pending
                          ? 'Đang gửi…'
                          : 'Mời'}
                    </LiquidButton>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons
                color="rgba(205,190,245,0.55)"
                name="albums-outline"
                size={28}
              />
              <Text style={styles.stateText}>
                Bạn chưa có Set đang mở và còn chỗ để gửi lời mời.
              </Text>
            </View>
          )}

          {invite.error || dashboard.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Dữ liệu Set vừa thay đổi hoặc kết nối đang gián đoạn. Hãy thử lại.
            </Text>
          ) : null}
          <LiquidButton onPress={onClose} variant="ghost">
            Đóng
          </LiquidButton>
        </LiquidCard>
      </View>
    </Modal>
  );
}

function intentLabel(value: string) {
  return (
    {
      normal: 'Chơi thoải mái',
      rank: 'Leo hạng',
      set_love: 'Set Love',
      soulmate: 'Hợp gu',
      team_rank: 'Lập đội',
    }[value] ?? 'Cùng chơi'
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,4,12,0.74)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  card: { gap: 17, padding: 18 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  frame: { maxWidth: 540, width: '100%' },
  handle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(224,215,255,0.24)',
    borderRadius: 999,
    height: 4,
    width: 42,
  },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headingCopy: { flex: 1, gap: 5 },
  headingIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(132,91,225,0.17)',
    borderRadius: 17,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  list: { gap: 2 },
  row: {
    alignItems: 'center',
    borderBottomColor: 'rgba(215,223,248,0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingVertical: 8,
  },
  rowCopy: { flex: 1, gap: 4, minWidth: 0 },
  setMeta: { color: 'rgba(210,219,242,0.55)', fontSize: 10.5 },
  setTitle: { color: '#F6F3FF', fontSize: 14, fontWeight: '800' },
  stateText: {
    color: 'rgba(218,225,246,0.66)',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  subtitle: { color: 'rgba(209,218,243,0.60)', fontSize: 11.5, lineHeight: 17 },
  title: {
    color: '#FAF8FF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
});
