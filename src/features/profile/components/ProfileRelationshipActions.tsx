import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import type { SocialCommandCoordinator } from '@/entities/social-relationship/social-command-coordinator';
import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  ReportCategoryV2,
  SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';
import {
  AppButton,
  AppCard,
  AppChip,
  AppText,
  appColors,
  appSpacing,
} from '@/shared/ui';

import { profileUi } from '../ui/profile-ui';

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

type ActionTone = 'danger' | 'ghost' | 'primary' | 'secondary';

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
  const hasSafetyActions =
    capabilities.canMute ||
    capabilities.canUnmute ||
    capabilities.canBlock ||
    capabilities.canReport;

  return (
    <AppCard
      backgroundColor={profileUi.colors.relationshipSurface}
      borderOpacity={profileUi.card.borderOpacity}
      contentStyle={styles.cardContent}
      density="compact"
      emphasis="none"
      radius={profileUi.radii.card}
      surfaceTone="low"
      testID="profile-relationship-actions"
      withShadow={false}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText tone="accent" variant="caption">
            QUAN HỆ & AN TOÀN
          </AppText>
          <AppText variant="h3">
            {friendshipCopy(capabilities.friendshipLabel)}
          </AppText>
          <AppText tone="tertiary" variant="bodySmall">
            {relationshipDescription(relationship)}
          </AppText>
        </View>
        <AppChip
          density="tag"
          icon={
            <Ionicons
              color={
                capabilities.blocked
                  ? appColors.status.warning
                  : appColors.accent.purpleIcon
              }
              name={capabilities.blocked ? 'ban-outline' : 'shield-checkmark'}
              size={13}
            />
          }
          variant={capabilities.blocked ? 'orange' : 'purple'}
          withSheen={false}
        >
          {capabilities.blocked
            ? 'Đã chặn'
            : capabilities.muted
              ? 'Đã tắt tiếng'
              : 'Đã xác minh'}
        </AppChip>
      </View>

      <View style={styles.primaryActions}>
        {capabilities.canRequestFriendship ? (
          <RelationshipButton
            disabled={pending}
            icon="person-add-outline"
            label="Kết bạn"
            onPress={() => mutation.mutate('request')}
            tone="primary"
          />
        ) : null}
        {capabilities.canAcceptFriendship ? (
          <RelationshipButton
            disabled={pending}
            icon="checkmark-circle-outline"
            label="Chấp nhận"
            onPress={() => mutation.mutate('accept')}
            tone="primary"
          />
        ) : null}
        {capabilities.canDeclineFriendship ? (
          <RelationshipButton
            disabled={pending}
            icon="close-circle-outline"
            label="Từ chối"
            onPress={() => mutation.mutate('decline')}
          />
        ) : null}
        {capabilities.canCancelFriendship ? (
          <RelationshipButton
            disabled={pending}
            icon="arrow-undo-outline"
            label="Huỷ lời mời"
            onPress={() => mutation.mutate('cancel')}
          />
        ) : null}
        {capabilities.canRemoveFriendship ? (
          <RelationshipButton
            disabled={pending}
            icon="person-remove-outline"
            label="Huỷ kết bạn"
            onPress={() => confirmRemove(() => mutation.mutate('remove'))}
            tone="danger"
          />
        ) : null}
        {capabilities.canUnblock ? (
          <RelationshipButton
            disabled={pending}
            icon="shield-checkmark-outline"
            label="Gỡ chặn"
            onPress={() => mutation.mutate('unblock')}
            tone="primary"
          />
        ) : null}
      </View>

      {hasSafetyActions ? (
        <View style={styles.safetySection}>
          <View style={styles.safetyHeadingRow}>
            <Ionicons
              color={appColors.icon.inactive}
              name="shield-outline"
              size={15}
            />
            <AppText tone="secondary" variant="label">
              Quyền riêng tư & an toàn
            </AppText>
          </View>
          <View style={styles.safetyActions}>
            {capabilities.canMute ? (
              <RelationshipButton
                disabled={pending}
                icon="notifications-off-outline"
                label="Tắt tiếng"
                onPress={() => mutation.mutate('mute')}
                tone="ghost"
              />
            ) : null}
            {capabilities.canUnmute ? (
              <RelationshipButton
                disabled={pending}
                icon="notifications-outline"
                label="Bật thông báo"
                onPress={() => mutation.mutate('unmute')}
                tone="ghost"
              />
            ) : null}
            {capabilities.canBlock ? (
              <RelationshipButton
                disabled={pending}
                icon="ban-outline"
                label="Chặn"
                onPress={() => confirmBlock(() => mutation.mutate('block'))}
                tone="danger"
              />
            ) : null}
            {capabilities.canReport ? (
              <RelationshipButton
                disabled={pending}
                icon="flag-outline"
                label="Báo cáo"
                onPress={() =>
                  chooseReportCategory((reportCategory) =>
                    mutation.mutate({ reportCategory }),
                  )
                }
                tone="ghost"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {pending ? (
        <View accessibilityLiveRegion="polite" style={styles.pendingRow}>
          <ActivityIndicator color={appColors.accent.purpleIcon} size="small" />
          <AppText tone="secondary" variant="caption">
            Đang cập nhật quan hệ an toàn…
          </AppText>
        </View>
      ) : null}

      {mutation.isError ? (
        <AppText
          accessibilityLiveRegion="polite"
          tone="danger"
          variant="caption"
        >
          {socialErrorMessage(mutation.error)}
        </AppText>
      ) : null}
    </AppCard>
  );
}

function RelationshipButton({
  disabled,
  icon,
  label,
  onPress,
  tone = 'secondary',
}: Readonly<{
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: ActionTone;
}>) {
  const danger = tone === 'danger';
  const primary = tone === 'primary';
  return (
    <AppButton
      accessibilityLabel={label}
      contentStyle={styles.buttonContent}
      disabled={disabled}
      emphasis={primary ? 'medium' : 'none'}
      onPress={onPress}
      style={styles.button}
      variant={primary ? 'primary' : tone === 'ghost' ? 'ghost' : 'secondary'}
      withShadow={primary}
    >
      <View style={styles.buttonCopy}>
        <Ionicons
          color={
            danger
              ? appColors.status.danger
              : primary
                ? appColors.text.onAccent
                : appColors.accent.purpleIcon
          }
          name={icon}
          size={16}
        />
        <AppText
          style={
            danger
              ? styles.dangerText
              : primary
                ? styles.primaryText
                : styles.secondaryText
          }
          variant="button"
        >
          {label}
        </AppText>
      </View>
    </AppButton>
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

function relationshipDescription(relationship: SocialRelationshipSnapshotV2) {
  const capabilities = relationship.capabilities;
  if (capabilities.blocked) {
    return 'Tương tác đang bị khoá theo trạng thái chặn. Gỡ chặn không tự khôi phục quan hệ cũ.';
  }
  if (capabilities.friendshipLabel === 'friend') {
    return capabilities.muted
      ? 'Hai bạn đang kết nối; thông báo từ người chơi này hiện đã tắt.'
      : 'Hai bạn đang kết nối và các quyền tương tác đã được hệ thống xác minh.';
  }
  if (capabilities.friendshipLabel === 'pending_incoming') {
    return 'Lời mời đang chờ quyết định của bạn.';
  }
  if (capabilities.friendshipLabel === 'pending_outgoing') {
    return 'Lời mời đã gửi và đang chờ người chơi phản hồi.';
  }
  return 'Các hành động chỉ mở khi trạng thái quan hệ cho phép.';
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
  primaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appSpacing.md,
  },
  button: { flexGrow: 1, minWidth: 112 },
  buttonContent: {
    minHeight: 44,
    paddingHorizontal: appSpacing.lg,
    paddingVertical: appSpacing.md,
  },
  buttonCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
    justifyContent: 'center',
  },
  cardContent: { gap: appSpacing['2xl'] },
  dangerText: { color: appColors.status.danger },
  headingCopy: { flex: 1, gap: appSpacing.xs, minWidth: 0 },
  headingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appSpacing.lg,
  },
  pendingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
  },
  primaryText: { color: appColors.text.onAccent },
  safetyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appSpacing.md,
  },
  safetyHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.sm,
  },
  safetySection: {
    borderTopColor: appColors.border.surfaceSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: appSpacing.md,
    paddingTop: appSpacing.xl,
  },
  secondaryText: { color: appColors.text.primary },
});
