import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppNotice,
  AppText,
  appColors,
  appSpacing,
} from '@/shared/ui';
import type { ApplicationErrorKind } from '@/shared/errors/application-error';

import { notificationsUi } from '../ui/notifications-ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function NotificationStaleNotice() {
  return (
    <AppNotice
      accessibilityLabel="Thông báo đang hiển thị dữ liệu cũ"
      icon="information-circle-outline"
      style={styles.staleNotice}
      title="Chưa thể làm mới"
      tone="warning"
    >
      Đang hiển thị thông báo đã tải gần nhất.
    </AppNotice>
  );
}

export function NotificationLoadingState() {
  return (
    <NotificationStateCard
      description="LiQi đang đồng bộ inbox mới nhất của bạn."
      icon="cloud-download-outline"
      loading
      title="Đang tải thông báo"
    />
  );
}

export function NotificationErrorState({
  kind,
  onRetry,
}: Readonly<{
  kind: ApplicationErrorKind;
  onRetry?: () => void;
}>) {
  const description =
    kind === 'offline'
      ? 'Thiết bị đang offline. Kết nối lại để tải thông báo.'
      : onRetry
        ? 'Dữ liệu tạm thời chưa sẵn sàng. Hãy thử lại.'
        : 'Yêu cầu thông báo không thể hoàn tất.';

  return (
    <NotificationStateCard
      actionLabel={onRetry ? 'Thử lại' : undefined}
      description={description}
      icon={
        kind === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'
      }
      onAction={onRetry}
      title="Không tải được thông báo"
      tone="warning"
    />
  );
}

export function NotificationEmptyState({
  filterLabel,
}: Readonly<{ filterLabel: string }>) {
  return (
    <NotificationStateCard
      description={`Không có cập nhật phù hợp với mục “${filterLabel}”.`}
      icon="checkmark-done-outline"
      title="Bạn đã xem hết"
    />
  );
}

function NotificationStateCard({
  actionLabel,
  description,
  icon,
  loading = false,
  onAction,
  title,
  tone = 'neutral',
}: Readonly<{
  actionLabel?: string;
  description: string;
  icon: IconName;
  loading?: boolean;
  onAction?: () => void;
  title: string;
  tone?: 'neutral' | 'warning';
}>) {
  const iconColor =
    tone === 'warning' ? appColors.status.warning : appColors.accent.purpleIcon;

  return (
    <AppCard
      contentStyle={styles.stateContent}
      density="large"
      emphasis="none"
      radius={notificationsUi.metrics.stateRadius}
      style={styles.stateCard}
      withHighlight={false}
      withShadow={false}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <View style={styles.iconShell}>
          <Ionicons color={iconColor} name={icon} size={28} />
        </View>
      )}
      <AppText tone="primary" variant="h3">
        {title}
      </AppText>
      <AppText style={styles.description} tone="secondary" variant="bodySmall">
        {description}
      </AppText>
      {actionLabel && onAction ? (
        <AppButton
          accessibilityLabel={actionLabel}
          emphasis="low"
          onPress={onAction}
          style={styles.action}
          variant="secondary"
          withShadow={false}
        >
          {actionLabel}
        </AppButton>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: appSpacing.md },
  description: { textAlign: 'center' },
  iconShell: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  staleNotice: { marginTop: appSpacing.xl },
  stateCard: { marginTop: appSpacing['5xl'] },
  stateContent: {
    alignItems: 'center',
    gap: appSpacing.md,
    paddingVertical: appSpacing['5xl'],
  },
});
