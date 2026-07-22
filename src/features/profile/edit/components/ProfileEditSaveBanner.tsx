import { AppButton, AppNotice } from '@/shared/ui';

import type { ProfileEditSaveResult } from '../services/profile-edit-coordinator';

export function ProfileEditSaveBanner({
  onRetry,
  result,
}: Readonly<{
  onRetry: () => void;
  result: ProfileEditSaveResult;
}>) {
  const failed = result.steps.find(
    (step) => step.status === 'failed' || step.status === 'partially-saved',
  );
  const assetNote = result.uploadedButUnassociated.length
    ? ` ${result.uploadedButUnassociated.length} ảnh đã upload nhưng chưa liên kết; retry dùng lại asset hiện có.`
    : '';

  return (
    <AppNotice
      accessibilityLabel="Trạng thái lưu hồ sơ"
      action={
        result.retrySections.length ? (
          <AppButton
            accessibilityLabel="Thử lưu lại phần thất bại"
            onPress={onRetry}
            variant="secondary"
            withShadow={false}
          >
            Thử lại
          </AppButton>
        ) : undefined
      }
      icon="warning-outline"
      title={
        result.outcome === 'partially-saved'
          ? 'Hồ sơ đã được lưu một phần'
          : 'Chưa lưu được thay đổi'
      }
      tone="warning"
    >
      {`${failed?.error ?? 'Có lỗi ở một bước cập nhật. Các bước phụ thuộc đã dừng.'}${assetNote}`}
    </AppNotice>
  );
}
