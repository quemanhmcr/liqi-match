# Primary production integration v1

This runbook describes the integrated primary source tree after the Identity,
Match, Discovery, Set, Conversation, and Home authority stacks were combined.
It is the operational source of truth for forward migrations and release work;
branch-local migration plans are advisory only.

## Source checkpoint

The primary integration contains:

- PKCE authentication and SecureStore session persistence;
- canonical AccountId → PlayerId → ProfileId identity;
- authoritative player lifecycle, suspension, resume, and deletion;
- optimistic Profile Identity versioning;
- authoritative Match Intent, candidate snapshots, decisions, Sets, and Home
  Match facts;
- authoritative Conversation bootstrap, mobile reads/writes, realtime token
  rotation, and message tombstones;
- lifecycle-to-Match-Intent projection dispatch with per-consumer receipts;
- an executable production walking skeleton from active intents through pending
  Conversation and Home facts.

Do not record a mutable “latest migration” number in this runbook. Determine the
current head from `supabase/migrations` and require `npm run migration-history:check`;
a prose checkpoint must never become the authority for the next timestamp.

## Migration rules

1. Never rename or edit a migration that has reached a shared environment.
2. Add a later repair migration instead of creating a second function overload
   or semantic write engine.
3. `private.command_receipts_v1` is the only command receipt authority. Do not
   create `private.command_idempotency_v1` or another equivalent table.
4. Semantic IDs remain distinct at service boundaries. Do not substitute a
   generic `userId` for AccountId, PlayerId, ProfileId, MatchId, ConversationId,
   or SetId.
5. A consumer projection may acknowledge the shared outbox event, but it must
   keep its own idempotent receipt and must not claim ownership of another
   consumer's processing state.
6. Migration filenames use one unique 12-digit version followed by a snake-case
   name. The repository gate rejects duplicate versions and stale references.
7. Once a migration reaches any shared project, never edit, rename or renumber it.
   Correct behavior with a later migration.
8. If remote history and Git disagree, stop deployment, back up the target, compare
   recorded names and SQL content, then repair history only for proven-equivalent
   migrations. Never mark different SQL as applied to silence `db push`.

## Required source validation

Run without build or prebuild:

```bash
npm ci
npm run task:check
npx --no-install deno check --no-lock supabase/functions/account-delete/index.ts
```

`task:check` includes migration history, executable Core V1 contracts, Match,
Discovery, Conversation, lifecycle projection, Home, rollout, telemetry, Set,
architecture, dependency audit, TypeScript, and Jest gates.

A green static SQL parser proves that PostgreSQL and PL/pgSQL syntax parses. It
does not replace applying the full chain to a real Supabase/PostgreSQL instance
and running pgTAP there.

## Environment deployment sequence

Deploy to an isolated or preview Supabase project first:

1. Back up the database and record the current migration version.
2. Apply the full forward migration chain in filename order.
3. Run all pgTAP database suites against the migrated database.
4. Deploy the `account-delete` Edge Function from the same source checkpoint.
5. Verify the function can resolve AccountId → PlayerId, tombstone legacy and
   Conversation v1 messages, and refuses Auth deletion after any cleanup error.
6. Start the Conversation bootstrap and Match Intent lifecycle dispatch workers.
7. Verify consumer receipts and pending outbox age before enabling cohorts.

Database migrations and Edge Function deployment are separate release actions.
A green repository or Deno check does not mean either has been deployed. A green
disposable E2E project also does not mean staging is current. Complete the
[environment parity runbook](mobile-backend-environment-parity.md) separately for
each release environment.

## Capability rollout

Use service-role operations only:

1. Enable authoritative reads for internal accounts.
2. Compare lifecycle, candidate, Home, and Conversation projections with the
   previous read surfaces.
3. Enable Match Intent writes for the same cohort.
4. Enable decision writes after Conversation bootstrap and notification
   consumers are healthy.
5. Enable Set writes only after Set event consumers accept the Core V1 fixtures.
6. Expand cohorts before global enablement.

Do not restore legacy semantic writes as an emergency rollback. Use the existing
capability flags and emergency stops to halt new authoritative work while
preserving aggregates, command receipts, events, and tombstones.

## Release evidence

Record these artifacts for every environment:

- source commit and lockfile checksum;
- last applied migration filename;
- pgTAP result and assertion totals;
- Edge Function deployment identifier;
- outbox lag and failed consumer receipts;
- cohort configuration and emergency-stop state;
- two-account walking-skeleton result;
- device smoke result after the user performs the approved build/prebuild flow.

## Current non-source release gaps

The repository does not itself prove:

- migrations were applied to a real Supabase environment;
- the account-deletion Edge Function was deployed;
- workers are scheduled and processing production outbox events;
- OAuth provider dashboards contain the production redirect URI;
- the flow passed on two physical devices;
- store/release builds were produced.

These remain explicit release-environment actions, not reasons to reintroduce
legacy identity, lifecycle, Match, or Conversation semantics into source.
