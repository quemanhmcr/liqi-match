import { z } from 'zod';

import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  type AuthenticatedPrincipalV1,
  type PlayerLifecycleSnapshotV1,
} from '@/shared/contracts/core-v1';
import { AuthError } from './auth-errors';

export type OAuthProvider = 'google' | 'facebook';

export type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  tokenType: string;
  user: SupabaseUser;
  /** Present for production sessions resolved through the authoritative provider. */
  principal?: AuthenticatedPrincipalV1;
  /** Present for production sessions; null means a canonical player is not yet bootstrapped. */
  lifecycle?: PlayerLifecycleSnapshotV1 | null;
};

export type AuthoritativeAuthSession = AuthSession & {
  principal: AuthenticatedPrincipalV1;
  lifecycle: PlayerLifecycleSnapshotV1 | null;
};

export type SupabaseSessionLike = Readonly<{
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at?: number;
  expires_in: number;
  user: Readonly<{
    id: string;
    email?: string;
    app_metadata?: unknown;
    user_metadata?: unknown;
  }>;
}>;

const AuthoritativePlayerContextSchema = z
  .object({
    principal: AuthenticatedPrincipalV1Schema,
    lifecycle: PlayerLifecycleSnapshotV1Schema.nullable(),
  })
  .passthrough();

function recordOrUndefined(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseAuthoritativePlayerContext(
  value: unknown,
  expectedAccountId: string,
): Readonly<{
  principal: AuthenticatedPrincipalV1;
  lifecycle: PlayerLifecycleSnapshotV1 | null;
}> {
  const parsed = AuthoritativePlayerContextSchema.safeParse(value);
  if (!parsed.success) {
    throw new AuthError(
      'Phản hồi identity/lifecycle không đúng contract Core V1.',
      'authoritative_context_invalid',
      { cause: parsed.error },
    );
  }

  const { lifecycle, principal } = parsed.data;
  if (principal.accountId !== expectedAccountId) {
    throw new AuthError(
      'Authentication subject không khớp identity mapping.',
      'principal_account_mismatch',
    );
  }
  if (principal.playerId === null && lifecycle !== null) {
    throw new AuthError(
      'Lifecycle không được tồn tại khi principal chưa có PlayerId.',
      'principal_lifecycle_mismatch',
    );
  }
  if (
    principal.playerId !== null &&
    lifecycle !== null &&
    principal.playerId !== lifecycle.playerId
  ) {
    throw new AuthError(
      'Principal và lifecycle không cùng PlayerId.',
      'principal_lifecycle_mismatch',
    );
  }

  return { lifecycle, principal };
}

export function toAuthoritativeAuthSession(
  session: SupabaseSessionLike,
  context: Readonly<{
    principal: AuthenticatedPrincipalV1;
    lifecycle: PlayerLifecycleSnapshotV1 | null;
  }>,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): AuthoritativeAuthSession {
  if (
    !session.access_token ||
    !session.refresh_token ||
    !session.token_type ||
    !session.user.id
  ) {
    throw new AuthError(
      'Supabase session thiếu token hoặc authentication subject.',
      'session_payload_invalid',
    );
  }
  if (session.user.id !== context.principal.accountId) {
    throw new AuthError(
      'Supabase session không khớp authentication subject.',
      'session_principal_mismatch',
    );
  }

  const expiresAt =
    session.expires_at ?? nowEpochSeconds + Number(session.expires_in);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowEpochSeconds) {
    throw new AuthError(
      'Supabase session đã hết hạn hoặc có timestamp không hợp lệ.',
      'session_expired',
    );
  }
  const principalExpiresAt = Math.floor(
    Date.parse(context.principal.expiresAt) / 1000,
  );
  if (
    !Number.isFinite(principalExpiresAt) ||
    Math.abs(principalExpiresAt - expiresAt) > 5
  ) {
    throw new AuthError(
      'Session expiry không khớp authenticated principal.',
      'session_principal_expiry_mismatch',
    );
  }

  const appMetadata = recordOrUndefined(session.user.app_metadata);
  const userMetadata = recordOrUndefined(session.user.user_metadata);

  return {
    accessToken: session.access_token,
    expiresAt,
    refreshToken: session.refresh_token,
    tokenType: session.token_type,
    user: {
      id: session.user.id,
      ...(session.user.email ? { email: session.user.email } : null),
      ...(appMetadata ? { app_metadata: appMetadata } : null),
      ...(userMetadata ? { user_metadata: userMetadata } : null),
    },
    principal: context.principal,
    lifecycle: context.lifecycle,
  };
}
