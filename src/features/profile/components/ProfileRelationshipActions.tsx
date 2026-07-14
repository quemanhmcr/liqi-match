import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, StyleSheet, View } from 'react-native';

import type { SocialCommandCoordinator } from '@/entities/social-relationship/social-command-coordinator';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
} from '@/shared/components/liquid';
import type {
  ReportCategoryV2,
  SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from './ProfileShared';

type RelationshipAction =
  | 'request'
  | 'accept'
  | 'decline'
  | 'cancel'
  | 'remove'
  | 'block'
  | 'unblock'
  | 'mute'
  | 'unmute'
  | Readonly<{ reportCategory: ReportCategoryV2 }>;

export type ProfileRelationshipActionsProps = Readonly<{
  coordinator: SocialCommandCoordinator;
  queryKey: readonly unknown[];
  relationship: SocialRelationshipSnapshotV2;
  session: AuthSession;
}>;

export function ProfileRelationshipActions({
  coordinator,
  queryKey,
  relationship,
  session,
}: ProfileRelationshipActionsProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: RelationshipAction) =>
      executeAction(coordinator, session, relationship, action),
    onSuccess: async (receipt) => {
      if ('relationship' in receipt) {
        queryClient.setQueryData(queryKey, receipt.relationship);
      } else {
        Alert.alert(
          'Đã gửi báo cáo',
          'Báo cáo đã được ghi nhận để đội an toàn xem xét.',
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-blocked-users'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-settings'] }),
      ]);
    },
  });
  const capabilities = relationship.capabilities;
  const pending = mutation.isPending;
  const friendshipLabel = friendshipCopy(capabilities.friendshipLabel);

  return (
    <LiquidCard
      contentStyle={styles.content}
      density="compact"
      glowIntensity="low"
      style={styles.card}
      withShadow={false}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <ProfileText style={styles.eyebrow}>QUAN HỆ & AN TOÀN</ProfileText>
          <ProfileText style={styles.title}>{friendshipLabel}</ProfileText>
        </View>
        <LiquidChip
          density="compact"
          variant={capabilities.blocked ? 'orange' : 'purple'}
        >
          {capabilities.blocked
            ? 'Đã chặn'
            : capabilities.muted
              ? 'Đã tắt tiếng'
              : 'Authoritative V2'}
        </LiquidChip>
      </View>

      <View style={styles.actionGrid}>
        {capabilities.canRequestFriendship ? (
          <ActionButton
            disabled={pending}
            icon="person-add-outline"
            label="Kết bạn"
            onPress={() => mutation.mutate('request')}
          />
        ) : null}
        {capabilities.canAcceptFriendship ? (
          <ActionButton
            disabled={pending}
            icon="checkmark-circle-outline"
            label="Chấp nhận"
            onPress={() => mutation.mutate('accept')}
          />
        ) : null}
        {capabilities.canDeclineFriendship ? (
          <ActionButton
            disabled={pending}
            icon="close-circle-outline"
            label="Từ chối"
            onPress={() => mutation.mutate('decline')}
            variant="secondary"
          />
        ) : null}
        {capabilities.canCancelFriendship ? (
          <ActionButton
            disabled={pending}
            icon="arrow-undo-outline"
            label="Huỷ lời mời"
            onPress={() => mutation.mutate('cancel')}
            variant="secondary"
          />
        ) : null}
        {capabilities.canRemoveFriendship ? (
          <ActionButton
            disabled={pending}
            icon="person-remove-outline"
            label="Huỷ kết bạn"
            onPress={() => confirmRemove(() => mutation.mutate('remove'))}
            variant="secondary"
          />
        ) : null}
        {capabilities.canMute ? (
          <ActionButton
            disabled={pending}
            icon="notifications-off-outline"
            label="Tắt tiếng"
            onPress={() => mutation.mutate('mute')}
            variant="secondary"
          />
        ) : null}
        {capabilities.canUnmute ? (
          <ActionButton
            disabled={pending}
            icon="notifications-outline"
            label="Bật thông báo"
            onPress={() => mutation.mutate('unmute')}
            variant="secondary"
          />
        ) : null}
        {capabilities.canBlock ? (
          <ActionButton
            disabled={pending}
            icon="ban-outline"
            label="Chặn"
            onPress={() => confirmBlock(() => mutation.mutate('block'))}
            variant="team"
          />
        ) : null}
        {capabilities.canUnblock ? (
          <ActionButton
            disabled={pending}
            icon="shield-checkmark-outline"
            label="Gỡ chặn"
            onPress={() => mutation.mutate('unblock')}
            variant="team"
          />
        ) : null}
        {capabilities.canReport ? (
          <ActionButton
            disabled={pending}
            icon="flag-outline"
            label="Báo cáo"
            onPress={() =>
              chooseReportCategory((reportCategory) =>
                mutation.mutate({ reportCategory }),
              )
            }
            variant="ghost"
          />
        ) : null}
      </View>

      {mutation.isError ? (
        <ProfileText accessibilityLiveRegion="polite" style={styles.errorText}>
          {socialErrorMessage(mutation.error)}
        </ProfileText>
      ) : null}
    </LiquidCard>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  variant = 'primary',
}: Readonly<{
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: 'ghost' | 'primary' | 'secondary' | 'team';
}>) {
  return (
    <LiquidButton
      accessibilityLabel={label}
      contentStyle={styles.buttonContent}
      disabled={disabled}
      glowIntensity="none"
      onPress={onPress}
      radius={18}
      style={styles.button}
      variant={variant}
      withShadow={false}
    >
      <Ionicons color="rgba(239,244,255,0.88)" name={icon} size={15} />
      <ProfileText style={styles.buttonText}>{label}</ProfileText>
    </LiquidButton>
  );
}

async function executeAction(
  coordinator: SocialCommandCoordinator,
  session: AuthSession,
  relationship: SocialRelationshipSnapshotV2,
  action: RelationshipAction,
) {
  const common = {
    expectedRelationshipVersion: relationship.version,
    session,
  };
  const target = { ...common, targetPlayerId: relationship.targetPlayerId };
  if (typeof action !== 'string') {
    return coordinator.reportPlayer({
      category: action.reportCategory,
      details: null,
      session,
      targetPlayerId: relationship.targetPlayerId,
    });
  }

  switch (action) {
    case 'request':
      return coordinator.requestFriendship(target);
    case 'accept':
    case 'decline':
    case 'cancel': {
      const friendshipRequestId = relationship.friendship.requestId;
      const expectedRequestVersion = relationship.friendship.requestVersion;
      if (!friendshipRequestId || expectedRequestVersion === null) {
        throw socialActionError(
          'friendship_request_not_found',
          'Lời mời kết bạn không còn khả dụng. Hãy tải lại hồ sơ.',
        );
      }
      const request = {
        ...common,
        expectedRequestVersion,
        friendshipRequestId,
      };
      if (action === 'accept') return coordinator.acceptFriendship(request);
      if (action === 'decline') return coordinator.declineFriendship(request);
      return coordinator.cancelFriendship(request);
    }
    case 'remove':
      return coordinator.removeFriendship(target);
    case 'block':
      return coordinator.blockPlayer({ ...target, reasonCode: 'user_choice' });
    case 'unblock':
      return coordinator.unblockPlayer(target);
    case 'mute':
      return coordinator.mutePlayer(target);
    case 'unmute':
      return coordinator.unmutePlayer(target);
  }
}

function friendshipCopy(
  label: SocialRelationshipSnapshotV2['friendship']['label'],
) {
  switch (label) {
    case 'friend':
      return 'Đang là bạn bè';
    case 'pending_incoming':
      return 'Có lời mời kết bạn';
    case 'pending_outgoing':
      return 'Đã gửi lời mời';
    case 'removed':
      return 'Quan hệ đã kết thúc';
    case 'none':
      return 'Chưa kết bạn';
  }
}

function confirmBlock(onConfirm: () => void) {
  Alert.alert(
    'Chặn người chơi này?',
    'Block sẽ huỷ friendship hiện tại và thu hồi quyền nhắn tin, mời session, xem presence và nhận thông báo giữa hai bên.',
    [
      { style: 'cancel', text: 'Huỷ' },
      { onPress: onConfirm, style: 'destructive', text: 'Chặn' },
    ],
  );
}

function confirmRemove(onConfirm: () => void) {
  Alert.alert(
    'Huỷ kết bạn?',
    'Hai bên sẽ không còn được coi là bạn bè. Hệ thống không tự khôi phục quan hệ cũ.',
    [
      { style: 'cancel', text: 'Giữ lại' },
      { onPress: onConfirm, style: 'destructive', text: 'Huỷ kết bạn' },
    ],
  );
}

function chooseReportCategory(onChoose: (category: ReportCategoryV2) => void) {
  Alert.alert('Báo cáo người chơi', 'Chọn lý do phù hợp nhất.', [
    { style: 'cancel', text: 'Huỷ' },
    { onPress: () => onChoose('harassment'), text: 'Quấy rối' },
    { onPress: () => onChoose('spam'), text: 'Spam' },
  ]);
}

function socialActionError(code: string, message: string) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function socialErrorMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : null;
  if (code === 'relationship_version_conflict') {
    return 'Quan hệ đã thay đổi ở phiên khác. Hãy tải lại hồ sơ.';
  }
  if (code === 'relationship_player_not_active') {
    return 'Người chơi hiện không thể nhận thay đổi quan hệ.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Chưa thể cập nhật quan hệ. Vui lòng thử lại.';
}

const styles = StyleSheet.create({
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: { flexGrow: 1, minWidth: 112 },
  buttonContent: { gap: 6, minHeight: 38, paddingHorizontal: 12 },
  buttonText: {
    color: 'rgba(239,244,255,0.88)',
    fontSize: 12,
    fontWeight: '800',
  },
  card: { marginTop: 12 },
  content: { gap: 12 },
  errorText: { color: '#FFB6B6', fontSize: 12, lineHeight: 17 },
  eyebrow: {
    color: 'rgba(186,239,255,0.58)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
  },
  headingCopy: { flex: 1, minWidth: 0 },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  title: {
    color: liquidColors.text.primary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
});
