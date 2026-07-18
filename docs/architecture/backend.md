# Backend architecture

## Intent

The backend is organized so database, account, media policy, storage, and
delivery work can proceed in parallel without editing a shared entrypoint or
importing another task's implementation. Deployment units stay explicit and
small; domain policy does not know which vendor or runtime executes it.

## System boundaries

```text
Expo client
   |-- RLS-safe reads/writes and SQL RPC --> Supabase Postgres
   |-- privileged commands -------------> Supabase Edge Functions
   `-- media reads ----------------------> Cloudflare Media Worker --> private R2

Postgres private.outbox_events ----------> idempotent async consumers
```

Supabase PostgreSQL is the source of truth for app, matching, chat, audit,
media metadata, and outbox state. R2 stores binary objects only. Presigned URLs
and server credentials are never persisted or returned outside their intended
short-lived operation.

## Client composition and environment authority

The backend becomes authoritative only when the mobile composition root selects API services for the same Supabase project whose schema and rollout state were verified. Authentication is one subsystem, not proof that application repositories are remote. The invalid split-brain state is:

```text
Supabase Auth -> remote project
Profile/Match/Session repositories -> simulation memory
```

`src/shared/config/env.ts` therefore rejects remote Supabase plus `simulation`, API mode rejects the placeholder key, and `staging-runtime` accepts only `liqi-match-staging`. The disposable E2E project is rejected before application services are composed. Query/cache identity that can cross accounts or projects must include the sanitized Supabase project ref and canonical actor identity. Late responses from a previous account, route or project must not mutate the current screen.

Environment roles are explicit:

- `wngumhizuxtlhavbpxzy`: `liqi-match-staging`, used for staging mobile/API behavior;
- `ibprkyemsuktfrdpxvza`: disposable cloud E2E proof, never a substitute for staging;
- production: always supplied and approved explicitly.

The current Supabase CLI link is not an environment decision. Before any remote query, migration, flag change or evidence run, print and verify the target ref. Prefer an isolated CLI workdir when inspecting or operating on a project other than the workspace's protected E2E link.

## Repository ownership

```text
supabase/
  migrations/                 # immutable, ordered database contract changes
  tests/database/             # pgTAP security/state/transaction contracts
  functions/
    <endpoint>/
      index.ts                # three-line deployment adapter
      handler.ts              # endpoint-owned request/use-case orchestration
    _shared/
      domain/                 # pure policy used by multiple endpoints
      infrastructure/         # Supabase/R2 external adapters
      platform/               # Deno/HTTP runtime primitives

cloudflare/media-worker/src/
  domain/                     # pure media rules
  application/                # use cases and ports
  infrastructure/             # Supabase/JWT/R2/queue implementations
  transport/                  # HTTP and queue protocols
  worker/                     # composition root
  index.ts                    # stable deployment entrypoint
```

| Area                                  | Owner scope          | Change policy                                                                   |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `supabase/migrations`, database tests | database/domain task | One immutable migration plus focused pgTAP contract; rebase before integration. |
| `supabase/functions/<endpoint>`       | endpoint task        | Own request contract and orchestration; never import another endpoint.          |
| `supabase/functions/_shared`          | backend platform     | Extract only after two endpoints need it; review all consumers.                 |
| Worker `domain`/`application`         | media domain         | Vendor-neutral rules and ports with unit tests.                                 |
| Worker `infrastructure`               | integration task     | One adapter per external system; no transport imports.                          |
| Worker `transport`/`worker`           | service platform     | Small routing/composition PR; preserve public contracts.                        |

## Dependency contracts

Worker dependencies point inward:

```text
transport -> application -> domain
infrastructure -----------> domain
worker composition root -> transport + infrastructure
```

Domain imports nothing outward. Application owns interfaces (ports), while
infrastructure implements them. Transport consumes use cases and must not reach
directly into adapters. The composition root is the only layer that wires both.

For Edge Functions, endpoint folders may use `_shared`, but never another
endpoint. Shared domain code cannot call `fetch`, read `Deno.env`, or depend on
Supabase/Cloudflare. Entrypoints contain deployment wiring only.

`npm run backend:architecture:check` enforces these rules, thin entrypoints,
endpoint isolation, and migration naming. It is part of the main architecture
CI gate.

## Adding work safely

### New Edge Function

1. Create `supabase/functions/<command>/index.ts` and `handler.ts`.
2. Keep request/response types and orchestration owned by that endpoint.
3. Reuse `_shared` only where an existing contract fits. Do not grow shared code
   speculatively.
4. Add database tests for every new privilege, RPC, state transition, or RLS
   policy.

### New Worker capability

1. Put business rules in `domain` and test them without Worker mocks.
2. Define required external behavior as an application port.
3. Implement the port in one infrastructure adapter.
4. Add protocol mapping under `transport`, then wire it in `worker`.

### Database migration

Committed migrations are immutable. Create a new timestamped migration rather
than editing an integrated one. Use `YYYYMMDDHHMM_description.sql`; coordinate
timestamps when branches start in the same minute. Keep unrelated domain
changes in separate migrations so conflicts and rollback reasoning stay local.
Every authorization or state-machine change ships with pgTAP coverage.

A migration deployed to any shared project is immutable: do not edit, rename or renumber it later. When an integrated migration needs correction, add a later reconciliation migration. If remote migration history already drifted, first back up the target and compare the recorded migration name and SQL content with Git; history repair is allowed only when equivalence is demonstrated.

## Parallel-development workflow

Use the [worktree decision guide](worktree-workflow.md) when choosing between a managed snapshot worktree and a normal Git worktree. Prefer an understood, current baseline and preserve local state before destructive operations.

Use one branch and Git worktree per task. A normal endpoint task should touch
one endpoint folder and its tests. A Worker policy task should remain in
`domain/application`; an adapter task should remain in `infrastructure`.
Changes to `_shared`, the Worker composition root, common SQL helpers, or CI are
platform changes and should be small dedicated PRs.

Rebase before integration, rerun the database from a clean reset, and never
resolve migration conflicts by renaming an already deployed migration. Split a
cross-cutting proposal into: contract/policy, adapters, then endpoint adoption.
That ordering lets feature branches build against a stable seam.

## Reliability and security contracts

- RLS/default-deny remains the client authorization boundary.
- Service-role and R2 credentials stay server-only.
- External side effects are idempotent and retryable; Postgres/R2 do not pretend
  to share a distributed transaction.
- Outbox consumers acknowledge only after their state transition succeeds.
- Private media failures return non-enumerating responses and `no-store`.
- Public delivery requires `ready`, moderation-approved, non-deleted metadata.
- Logs carry request/event identifiers and never bearer tokens or secrets.

## Local validation

```sh
npm run backend:architecture:check
supabase start
supabase db reset
supabase db lint
supabase test db
npm --prefix cloudflare/media-worker ci
npm --prefix cloudflare/media-worker run typecheck
npm --prefix cloudflare/media-worker test
npm --prefix cloudflare/media-worker run deploy:dry-run
```

Before handoff also run the repository-wide lint, typecheck, and test gates. For staging or production claims, repository checks are necessary but insufficient; complete the [mobile/backend environment parity runbook](../runbooks/mobile-backend-environment-parity.md) on the named target.
