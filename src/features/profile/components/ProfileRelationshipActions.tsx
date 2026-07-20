import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, StyleSheet, View } from 'react-native';

import type { SocialCommandCoordinator } from '@/entities/social-relationship/social-command-coordinator';
import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  ReportCategoryV2,
  SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';
import {
  liqiColors,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import {
  ProfileActionButton,
  ProfilePill,
  ProfileSurface,
  type ProfileActionVariant,
} from './ProfilePresentationPrimitives';
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
    <ProfileSurface style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <ProfileText style={styles.eyebrow}>QUAN HỆ & AN TOÀN</ProfileText>
          <ProfileText style={styles.title}>{friendshipLabel}</ProfileText>
        </View>
        <ProfilePill
          icon={
            capabilities.blocked ? 'ban-outline' : 'shield-checkmark-outline'
          }
          label={
            capabilities.blocked
              ? 'Đã chặn'
              : capabilities.muted
                ? 'Đã tắt tiếng'
                : 'Đã xác minh'
          }
          tone={capabilities.blocked ? 'amber' : 'purple'}
        />
      </View>

      <View style={styles.actionGrid}>
        {capabilities.canRequestFriendship ? (
          <ActionButton
            disabled={pending}
            icon="person-add-outline"
            label="Kết bạn"
            onPress={() => mutation.mutate('request')}
            variant="primary"
          />
        ) : null}
        {capabilities.canAcceptFriendship ? (
          <ActionButton
            disabled={pending}
            icon="checkmark-circle-outline"
            label="Chấp nhận"
            onPress={() => mutation.mutate('accept')}
            variant="primary"
          />
        ) : null}
        {capabilities.canDeclineFriendship ? (
          <ActionButton
            disabled={pending}
            icon="close-circle-outline"
            label="Từ chối"
            onPress={() => mutation.mutate('decline')}
          />
        ) : null}
        {capabilities.canCancelFriendship ? (
          <ActionButton
            disabled={pending}
            icon="arrow-undo-outline"
            label="Huỷ lời mời"
            onPress={() => mutation.mutate('cancel')}
          />
        ) : null}
        {capabilities.canRemoveFriendship ? (
          <ActionButton
            disabled={pending}
            icon="person-remove-outline"
            label="Huỷ kết bạn"
            onPress={() => confirmRemove(() => mutation.mutate('remove'))}
            variant="danger"
          />
        ) : null}
        {capabilities.canMute ? (
          <ActionButton
            disabled={pending}
            icon="notifications-off-outline"
            label="Tắt tiếng"
            onPress={() => mutation.mutate('mute')}
            variant="ghost"
          />
        ) : null}
        {capabilities.canUnmute ? (
          <ActionButton
            disabled={pending}
            icon="notifications-outline"
            label="Bật thông báo"
            onPress={() => mutation.mutate('unmute')}
            variant="ghost"
          />
        ) : null}
        {capabilities.canBlock ? (
          <ActionButton
            disabled={pending}
            icon="ban-outline"
            label="Chặn"
            onPress={() => confirmBlock(() => mutation.mutate('block'))}
            variant="danger"
          />
        ) : null}
        {capabilities.canUnblock ? (
          <ActionButton
            disabled={pending}
            icon="shield-checkmark-outline"
            label="Gỡ chặn"
            onPress={() => mutation.mutate('unblock')}
            variant="primary"
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
    </ProfileSurface>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  variant = 'secondary',
}: Readonly<{
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: ProfileActionVariant;
}>) {
  return (
    <ProfileActionButton
      disabled={disabled}
      icon={icon}
      label={label}
      onPress={onPress}
      style={styles.button}
      variant={variant}
    />
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
    gap: liqiSpacing.md,
    marginTop: liqiSpacing.xl,
  },
  button: { flexGrow: 1, minWidth: 112 },
  card: { gap: liqiSpacing.xl },
  errorText: {
    ...liqiTypography.caption,
    color: liqiColors.status.danger,
    marginTop: liqiSpacing.md,
  },
  eyebrow: {
    ...liqiTypography.caption,
    color: liqiColors.accent.purpleIcon,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  headingCopy: { flex: 1, minWidth: 0 },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.lg,
  },
  title: {
    ...liqiTypography.sectionTitle,
    color: liqiColors.text.primary,
    marginTop: liqiSpacing.xs,
  },
});
