import { AppIdentityHeader } from '@/shared/ui';

export function NotificationInboxHeader({
  compact,
  onBack,
}: Readonly<{
  compact: boolean;
  onBack: () => void;
}>) {
  return (
    <AppIdentityHeader
      compact={compact}
      leadingAction={{
        accessibilityLabel: 'Quay lại',
        icon: 'chevron-back',
        onPress: onBack,
        testID: 'notifications-header-back-action',
      }}
      online={false}
      presentation="page"
      subtitle="Những cập nhật quan trọng từ LiQi"
      testID="notifications-identity-header"
      title="Thông báo"
    />
  );
}
