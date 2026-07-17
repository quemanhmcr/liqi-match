import { describe, expect, it } from '@jest/globals';

import { presentPlaySessionError } from './play-session-error-presentation';

describe('presentPlaySessionError', () => {
  it('explains disabled review configuration without blaming connectivity', () => {
    expect(
      presentPlaySessionError(
        { code: 'feature_disabled', retryable: false },
        'create',
      ),
    ).toEqual({
      code: 'feature_disabled',
      message:
        'Môi trường này chưa bật quyền tạo buổi chơi. Hãy bật Party/Session review flags rồi thử lại.',
      retryable: false,
    });
  });

  it('distinguishes account activation from Match Intent readiness', () => {
    expect(
      presentPlaySessionError(
        { code: 'lifecycle_not_active', retryable: false },
        'create',
      ),
    ).toEqual({
      code: 'lifecycle_not_active',
      message:
        'Tài khoản chưa hoàn tất kích hoạt để dùng Buổi chơi. “Bật tìm đội” chỉ mở tìm người, không thay thế bước hoàn tất hồ sơ.',
      retryable: false,
    });
  });

  it('keeps network failures explicitly retryable', () => {
    expect(
      presentPlaySessionError(
        { code: 'network_error', retryable: true },
        'create',
      ),
    ).toMatchObject({ code: 'network_error', retryable: true });
  });

  it('does not expose opaque server messages to the user', () => {
    expect(
      presentPlaySessionError(
        new Error('internal implementation detail'),
        'create',
      ).message,
    ).toBe('Buổi chơi chưa thể tạo. Hãy kiểm tra kết nối và thử lại.');
  });
});
