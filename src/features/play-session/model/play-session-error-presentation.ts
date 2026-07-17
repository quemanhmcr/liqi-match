import { classifyApplicationError } from '@/shared/errors/application-error';

export type PlaySessionErrorPresentation = Readonly<{
  code?: string;
  message: string;
  retryable: boolean;
}>;

type PlaySessionOperation = 'create' | 'mutate' | 'read';

export function presentPlaySessionError(
  error: unknown,
  operation: PlaySessionOperation,
): PlaySessionErrorPresentation {
  const classified = classifyApplicationError(error);
  const code = classified.code;

  switch (code) {
    case 'feature_disabled':
      return presentation(
        code,
        operation === 'create'
          ? 'Môi trường này chưa bật quyền tạo buổi chơi. Hãy bật Party/Session review flags rồi thử lại.'
          : 'Tính năng Buổi chơi đang tạm khoá trong môi trường này.',
        false,
      );
    case 'unauthenticated':
      return presentation(
        code,
        'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại trước khi tiếp tục.',
        false,
      );
    case 'lifecycle_not_active':
    case 'player_not_active':
      return presentation(
        code,
        'Tài khoản chưa hoàn tất kích hoạt để dùng Buổi chơi. “Bật tìm đội” chỉ mở tìm người, không thay thế bước hoàn tất hồ sơ.',
        false,
      );
    case 'version_conflict':
    case 'aggregate_version_conflict':
      return presentation(
        code,
        'Buổi chơi đã thay đổi ở thiết bị khác. Dữ liệu mới nhất đang được tải lại.',
        true,
      );
    case 'relationship_blocked':
      return presentation(
        code,
        'Không thể mời một người chơi đang bị chặn trong quan hệ hiện tại.',
        false,
      );
    case 'invitation_not_allowed':
      return presentation(
        code,
        'Cài đặt riêng tư của người chơi không cho phép lời mời Buổi chơi này.',
        false,
      );
    case 'validation_failed':
      return presentation(
        code,
        'Thông tin Buổi chơi không còn hợp lệ. Hãy kiểm tra tên, lịch và danh sách mời.',
        false,
      );
    case 'network_error':
    case 'offline':
      return presentation(
        code,
        'Không kết nối được tới máy chủ. Nội dung đã nhập vẫn được giữ để bạn thử lại.',
        true,
      );
    case 'timeout':
    case 'rate_limited':
      return presentation(
        code,
        'Máy chủ chưa phản hồi kịp. Nội dung đã nhập vẫn được giữ để bạn thử lại.',
        true,
      );
    case 'not_found':
      return presentation(
        code,
        'Buổi chơi hoặc lời mời này không còn tồn tại.',
        false,
      );
    default:
      return presentation(
        code,
        operation === 'create'
          ? 'Buổi chơi chưa thể tạo. Hãy kiểm tra kết nối và thử lại.'
          : 'Thao tác Buổi chơi chưa thể hoàn tất. Hãy tải lại và thử lại.',
        classified.retryable,
      );
  }
}

function presentation(
  code: string | undefined,
  message: string,
  retryable: boolean,
): PlaySessionErrorPresentation {
  return { ...(code ? { code } : {}), message, retryable };
}
