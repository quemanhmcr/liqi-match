import { describe, expect, it } from '@jest/globals';

import { AuthError } from '@/shared/auth/auth-errors';
import { validateOAuthCallback } from '@/shared/auth/oauth-callback';

const redirect = 'liqimatch://auth/callback';

describe('validateOAuthCallback', () => {
  it('accepts exactly one PKCE authorization code on the registered target', () => {
    expect(
      validateOAuthCallback(
        'liqimatch://auth/callback?code=code-123',
        redirect,
      ),
    ).toBe('code-123');
  });

  it.each([
    'evilapp://auth/callback?code=code-123',
    'liqimatch://other/callback?code=code-123',
    'liqimatch://auth/other?code=code-123',
    'liqimatch://user@auth/callback?code=code-123',
  ])('rejects an unregistered callback target: %s', (url) => {
    expect(() => validateOAuthCallback(url, redirect)).toThrow(
      expect.objectContaining({ code: 'oauth_callback_target_mismatch' }),
    );
  });

  it.each([
    'liqimatch://auth/callback#access_token=secret&refresh_token=secret',
    'liqimatch://auth/callback?access_token=secret&code=code-123',
    'liqimatch://auth/callback?refresh_token=secret&code=code-123',
  ])('rejects an implicit/token callback: %s', (url) => {
    expect(() => validateOAuthCallback(url, redirect)).toThrow(
      expect.objectContaining({ code: 'oauth_implicit_callback_rejected' }),
    );
  });

  it('rejects a callback without a code', () => {
    expect(() => validateOAuthCallback(redirect, redirect)).toThrow(
      expect.objectContaining({ code: 'oauth_missing_code' }),
    );
  });

  it('rejects duplicate authorization codes', () => {
    expect(() =>
      validateOAuthCallback(
        'liqimatch://auth/callback?code=first&code=second',
        redirect,
      ),
    ).toThrow(expect.objectContaining({ code: 'oauth_duplicate_code' }));
  });

  it('surfaces a provider error without leaking callback tokens', () => {
    expect.assertions(2);
    try {
      validateOAuthCallback(
        'liqimatch://auth/callback?error=access_denied&error_description=Denied',
        redirect,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect(error).toMatchObject({ code: 'access_denied', message: 'Denied' });
    }
  });
});
