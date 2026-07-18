# Disposable Party/Session E2E review

This runbook is intentionally **not a mobile-runtime runbook**. The disposable
Supabase project `liqi-conversation-v2-e2e-217c84e`
(`ibprkyemsuktfrdpxvza`) exists only for isolated SQL/RPC and authenticated API
E2E evidence.

The mobile application must never use this project. Normal preview/device work
uses `liqi-match-staging` (`wngumhizuxtlhavbpxzy`) through
`EXPO_PUBLIC_BACKEND_TARGET=staging-runtime`.

## 1. Verify the fixed workspace roles

```powershell
npm run supabase:roles:check
npm run supabase:e2e:cli:check
```

Expected state:

```text
runtime: staging-runtime -> wngumhizuxtlhavbpxzy
workspace CLI: e2e-disposable -> ibprkyemsuktfrdpxvza
```

Stop if either role differs. Do not relink the primary workspace to staging just
to run an operational command; use an isolated Supabase workdir for staging.

## 2. Inspect or open the disposable write window

The review controller is hard-restricted to `e2e-disposable` and verifies the
linked project before issuing SQL.

```powershell
npm run party-session:review:status
npm run party-session:review:enable
```

Opening the E2E write window follows the rollout order: reads, reconciliation,
mutation writes, then creation writes.

## 3. Run test harnesses only

Cloud pgTAP/RPC proof:

```powershell
npm run e2e:party-session:cloud-db
npm run e2e:conversation:cloud-db
npm run e2e:trust-return-loop:cloud-db
npm run e2e:core-v2:cloud-db
```

Authenticated REST E2E requires E2E-project credentials in the local/CI secret
store. The executable runners verify that `SUPABASE_URL` resolves to
`ibprkyemsuktfrdpxvza` before using any token or service-role key:

```powershell
npm run e2e:party-session:api
npm run e2e:return-loop:api
```

Do not start Metro with the E2E URL, do not copy the E2E publishable key into
`.env.local`, and do not use E2E accounts as staging evidence.

## 4. Close the disposable write window

This preserves reads while disabling creation, mutation, and reconciliation
writes:

```powershell
npm run party-session:review:disable-writes
```

For real mobile/API behavior, use the
[mobile/backend environment parity runbook](mobile-backend-environment-parity.md)
and produce staging-scoped release evidence.
