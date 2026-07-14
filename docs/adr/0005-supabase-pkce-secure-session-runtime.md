# ADR 0005: Supabase PKCE secure session runtime

- Status: Accepted
- Date: 2026-07-14
- Owner: Senior 1 / Mission 1

## Context

The legacy mobile auth adapter used an implicit OAuth callback, manually listened
for deep links, refreshed tokens itself, and persisted the complete session in
AsyncStorage. That created duplicate refresh semantics and exposed bearer and
refresh tokens outside OS-backed secure storage.

Mission 1 requires Authorization Code + PKCE, Keychain/Keystore persistence,
recoverable session restoration, strict callback validation, authoritative
AccountId-to-PlayerId resolution, and a refresh hook consumable by realtime
features.

## Decision

1. A single Supabase client owns PKCE verifier persistence, refresh-token
   rotation, auth locking, auth events, and Realtime token propagation.
2. Expo WebBrowser owns the interactive browser session. The callback accepts
   exactly one authorization code on the registered redirect target and rejects
   all token-bearing fragments/query parameters.
3. Supabase auth storage uses the chunked Expo SecureStore adapter. Native
   credentials use a this-device-only keychain accessibility class. The legacy
   AsyncStorage session key is removed and verified absent before restore.
4. AppState ownership lives only in the auth runtime. Auto-refresh runs while
   active; foreground reconciliation re-resolves authoritative lifecycle state.
5. Auth event callbacks remain synchronous and defer network work outside the
   Supabase auth lock.
6. `AuthSession` keeps transport compatibility for current features while
   production sessions add validated `AuthenticatedPrincipalV1` and
   `PlayerLifecycleSnapshotV1` fields.
7. Realtime consumers use `subscribeAccessToken`; request consumers use
   `getValidAccessToken` rather than reading storage or implementing refresh.
8. Session reconciliation is revisioned and deduplicated so stale requests
   cannot revive a signed-out or superseded session.

## Consequences

- No production token is written to AsyncStorage.
- Implicit OAuth callbacks and manual Linking callback listeners are forbidden.
- Transient restore failures remain retryable and do not silently log the user
  out; terminal identity/session contract failures clear local credentials.
- Provider lifecycle changes such as suspension or deletion are visible after
  foreground reconciliation without waiting for token expiry.
- Web popup completion has a same-origin `/auth/callback` landing route.
- Native redirect configuration still requires a user-run development/release
  build; build and prebuild are intentionally outside this change.

## Rollback

Disable the PKCE auth feature cohort and return to the previous auth adapter,
but do not restore AsyncStorage token persistence. The additive secure storage,
callback route, and authoritative identity schema remain in place.
