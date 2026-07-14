import { describe, expect, it } from '@jest/globals';

import {
  parseAuthoritativePlayerContext,
  toAuthoritativeAuthSession,
  type SupabaseSessionLike,
} from '@/shared/auth/auth-session';

const accountId = '01000000-0000-4000-8000-000000000020';
const playerId = '20000000-0000-4000-8000-000000000020';
const profileId = '30000000-0000-4000-8000-000000000020';

const principal = {
  accountId,
  playerId,
  sessionId: '09000000-0000-4000-8000-000000000020',
  issuedAt: '2026-07-14T08:00:00.000Z',
  expiresAt: '2026-07-14T09:00:00.000Z',
};
const lifecycle = {
  playerId,
  profileId,
  state: 'active',
  version: 2,
  discoverable: true,
  messagingAllowed: true,
  updatedAt: '2026-07-14T08:05:00.000Z',
};

const supabaseSession: SupabaseSessionLike = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_at: 1_784_019_600,
  expires_in: 3_600,
  user: {
    id: accountId,
    email: 'player@example.test',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Player' },
  },
};

describe('authoritative auth session mapping', () => {
  it('parses principal and exact lifecycle as separate authorities', () => {
    const parsed = parseAuthoritativePlayerContext(
      { principal, lifecycle, repeated: true },
      accountId,
    );

    expect(parsed.principal.accountId).toBe(accountId);
    expect(parsed.lifecycle?.profileId).toBe(profileId);
    expect(parsed.lifecycle).not.toHaveProperty('accountId');
    expect(parsed.lifecycle).not.toHaveProperty('profileVersion');
  });

  it('rejects a principal for another authentication subject', () => {
    expect(() =>
      parseAuthoritativePlayerContext(
        {
          principal: {
            ...principal,
            accountId: '01000000-0000-4000-8000-000000000099',
          },
          lifecycle,
        },
        accountId,
      ),
    ).toThrow(expect.objectContaining({ code: 'principal_account_mismatch' }));
  });

  it('rejects a lifecycle that belongs to another PlayerId', () => {
    expect(() =>
      parseAuthoritativePlayerContext(
        {
          principal,
          lifecycle: {
            ...lifecycle,
            playerId: '20000000-0000-4000-8000-000000000099',
          },
        },
        accountId,
      ),
    ).toThrow(
      expect.objectContaining({ code: 'principal_lifecycle_mismatch' }),
    );
  });

  it('maps Supabase transport tokens while retaining authoritative identity', () => {
    const context = parseAuthoritativePlayerContext(
      { principal, lifecycle },
      accountId,
    );
    const session = toAuthoritativeAuthSession(
      supabaseSession,
      context,
      1_784_016_001,
    );

    expect(session.accessToken).toBe('access-token');
    expect(session.user.id).toBe(accountId);
    expect(session.principal.playerId).toBe(playerId);
    expect(session.lifecycle?.messagingAllowed).toBe(true);
  });
  it('rejects expired transport sessions before exposing tokens', () => {
    const context = parseAuthoritativePlayerContext(
      { principal, lifecycle },
      accountId,
    );
    expect(() =>
      toAuthoritativeAuthSession(
        { ...supabaseSession, expires_at: 1_784_010_000 },
        context,
        1_784_010_001,
      ),
    ).toThrow(expect.objectContaining({ code: 'session_expired' }));
  });

  it('rejects an expiry that does not match the server principal', () => {
    const context = parseAuthoritativePlayerContext(
      { principal, lifecycle },
      accountId,
    );
    expect(() =>
      toAuthoritativeAuthSession(
        { ...supabaseSession, expires_at: 1_784_019_700 },
        context,
        1_784_010_000,
      ),
    ).toThrow(
      expect.objectContaining({ code: 'session_principal_expiry_mismatch' }),
    );
  });
});
