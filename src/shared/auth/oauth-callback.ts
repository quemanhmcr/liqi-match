import { AuthError } from './auth-errors';

const FORBIDDEN_TOKEN_PARAMETERS = [
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'token_type',
  'expires_in',
  'expires_at',
] as const;

function normalizedPort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === 'https:') return '443';
  if (url.protocol === 'http:') return '80';
  return '';
}

function sameRedirectTarget(actual: URL, expected: URL): boolean {
  return (
    actual.protocol.toLowerCase() === expected.protocol.toLowerCase() &&
    actual.hostname.toLowerCase() === expected.hostname.toLowerCase() &&
    normalizedPort(actual) === normalizedPort(expected) &&
    actual.pathname === expected.pathname &&
    actual.username === '' &&
    actual.password === ''
  );
}

export function validateOAuthCallback(
  callbackUrl: string,
  expectedRedirectUrl: string,
): string {
  let callback: URL;
  let expected: URL;
  try {
    callback = new URL(callbackUrl);
    expected = new URL(expectedRedirectUrl);
  } catch (error) {
    throw new AuthError(
      'OAuth callback URL không hợp lệ.',
      'oauth_callback_malformed',
      { cause: error },
    );
  }

  if (!sameRedirectTarget(callback, expected)) {
    throw new AuthError(
      'OAuth callback không khớp redirect URI đã đăng ký.',
      'oauth_callback_target_mismatch',
    );
  }
  if (callback.hash !== '') {
    throw new AuthError(
      'OAuth callback chứa fragment token không được hỗ trợ.',
      'oauth_implicit_callback_rejected',
    );
  }
  for (const key of FORBIDDEN_TOKEN_PARAMETERS) {
    if (callback.searchParams.has(key)) {
      throw new AuthError(
        'OAuth callback chứa token trực tiếp thay vì authorization code.',
        'oauth_implicit_callback_rejected',
      );
    }
  }

  const oauthError =
    callback.searchParams.get('error_code') ??
    callback.searchParams.get('error');
  if (oauthError) {
    throw new AuthError(
      callback.searchParams.get('error_description') ??
        'Đăng nhập đã bị hủy hoặc không thành công.',
      oauthError,
    );
  }

  const codes = callback.searchParams.getAll('code');
  if (codes.length !== 1 || codes[0]?.trim() === '') {
    throw new AuthError(
      'OAuth callback phải chứa đúng một authorization code.',
      codes.length > 1 ? 'oauth_duplicate_code' : 'oauth_missing_code',
    );
  }

  return codes[0]!;
}
