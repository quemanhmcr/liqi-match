# Mobile Party/Session review

Use only the disposable Supabase project `ibprkyemsuktfrdpxvza`.
The review controller refuses every other project ref and also verifies the
workspace link before changing feature flags.

This runbook produces isolated E2E evidence only. It does not prove that
`liqi-match-staging` is migrated, enabled or used by a mobile bundle. Do not copy
this project ref into the normal staging `.env.local`. For staging work use the
[mobile/backend environment parity runbook](mobile-backend-environment-parity.md).

## 1. Confirm the linked project and flags

```powershell
npm run party-session:review:status -- --project-ref ibprkyemsuktfrdpxvza
```

## 2. Enable the isolated review environment

This follows the rollout order: reads, reconciliation, mutation writes, then
creation writes.

```powershell
npm run party-session:review:enable -- --project-ref ibprkyemsuktfrdpxvza
```

## 3. Start the phone review with an explicit environment

`.env.local` is intentionally ignored because it may belong to another
workspace environment. Never place a service-role key in an `EXPO_PUBLIC_*`
variable.

```powershell
$env:EXPO_NO_DOTENV="1"
$env:EXPO_PUBLIC_APPLICATION_RUNTIME_MODE="api"
$env:EXPO_PUBLIC_SUPABASE_URL="https://ibprkyemsuktfrdpxvza.supabase.co"
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<TEST_PROJECT_PUBLISHABLE_KEY>"
npm run start
```

After changing an `EXPO_PUBLIC_*` value, perform a full app reload rather than
relying on Fast Refresh. Development auth storage is scoped by Supabase project,
so sign in again after switching the review project; a JWT from another project
will not be restored into this client.

Always set `EXPO_PUBLIC_APPLICATION_RUNTIME_MODE` explicitly. A development
bundle without this variable defaults to simulation. Combining real Supabase Auth
with simulation repositories creates a hybrid runtime and is not valid cloud E2E
evidence. The runtime validator must continue to reject that remote/simulation
combination.

`Bật tìm đội` activates Match Intent only. It never transitions Player Lifecycle.
The account must already have completed onboarding and have lifecycle `active`;
both simulation and API paths must enforce this same rule.

## 4. Review create and retry behavior

- A single press creates one Session.
- Rapid double press still creates one Session.
- Disable network during submit; after the timeout, restore network and press
  **Thử tạo lại**. The client reuses the exact command and idempotency key.
- Leave the route while a request is resolving. A late callback must not reopen
  the old route.
- Sign out or switch account during a request. A response from the old account
  must not navigate the new account.

## 5. Close the write window

This preserves reads but disables creation, mutation, and reconciliation writes.

```powershell
npm run party-session:review:disable-writes -- --project-ref ibprkyemsuktfrdpxvza
```
