# Final cloud database E2E evidence

> Historical, project-scoped evidence only. This document proves the disposable
> E2E project `ibprkyemsuktfrdpxvza`; it is not staging or production readiness.
> Use `docs/runbooks/mobile-backend-environment-parity.md` for current environment
> claims.

Date: 2026-07-17 (Asia/Bangkok)
Workspace: `C:\project\liqi_match`
Branch: `main`

## Isolated Supabase target

All remote database work in this proof used the dedicated disposable project
previously established by the senior implementation team:

- Project: `liqi-conversation-v2-e2e-217c84e`
- Project ref: `ibprkyemsuktfrdpxvza`
- Supabase CLI: `2.109.1`

Every runner required the explicit project ref and verified that the linked
workspace ref matched it. No staging or production project was used. No API key,
access token, database password, or connection URL is stored in this document.

## Migration application and parity

A linked dry run showed only these three pending forward migrations:

- `202607160900_match_set_dashboard_identity_v2.sql`
- `202607160910_decline_session_invite_v2.sql`
- `202607160911_social_hub_relationships_v2.sql`

They were applied to the isolated E2E project. The final linked migration list
has local/remote parity through `202607160911`, and the final `db push --dry-run`
reported `Remote database is up to date.`

## Cloud failures found and repaired

The first real cloud execution of
`decline_session_invite_v2.test.sql` caught two evidence errors that static SQL
parsing could not detect:

1. The test queried a nonexistent top-level
   `private.outbox_events.aggregate_version` column. The canonical version is
   stored at `payload.aggregateVersion` in the Core V2 event envelope.
2. The target player assertion used `data.targetPlayerId`; the canonical domain
   payload path is `payload.payload.targetPlayerId`.

After correcting both paths, pgTAP exposed a second issue: the suite declared
`plan(17)` while it contained 18 assertions. The plan is now 18.

## New database suites

Direct cloud execution passed all new suites:

| Suite                                      | Assertions |
| ------------------------------------------ | ---------: |
| `match_set_dashboard_identity_v2.test.sql` |         18 |
| `decline_session_invite_v2.test.sql`       |         18 |
| `social_hub_relationships_v2.test.sql`     |          9 |
| **Total**                                  |     **45** |

## Whole Core V2 cloud regression

The senior full-matrix runner was executed in four Windows-safe shards and then
validated with its evidence aggregator:

```text
ALL_CORE_V2_CLOUD_DB_PASS suites=50 assertions=1221 project_ref=ibprkyemsuktfrdpxvza
```

Shard evidence:

| Shard     | Suites | Assertions |
| --------- | -----: | ---------: |
| 1/4       |     13 |        318 |
| 2/4       |     13 |        324 |
| 3/4       |     12 |        276 |
| 4/4       |     12 |        303 |
| **Total** | **50** |   **1221** |

This matrix executes every `supabase/tests/database/*.test.sql` suite against the
real cloud PostgreSQL project and covers identity/lifecycle, Match, Discover,
Conversation, Social, Party/Session, Trust/Return Loop, notifications, profile,
media authority, RLS, replay, stale-version rejection, and release readiness.

## Specialized Party/Session proof

The specialized Party/Session runner and its static guard now include the Match
Set dashboard and Session invite-decline suites. Its protected total increased
from 6 suites / 213 assertions to 8 suites / 249 assertions.

Final cloud result:

```text
ALL_PARTY_SESSION_CLOUD_DB_PASS suites=8 assertions=249 project_ref=ibprkyemsuktfrdpxvza
```

## Lint and rollback hygiene

- `supabase db lint --linked --schema public,private --level error --fail-on error`:
  no application-schema findings.
- Linting the `extensions` schema reports pgTAP self-reference diagnostics;
  these are extension-internal findings and are excluded from the application
  schema result.
- A dynamic residue probe extracted all 38 fixture UUIDs from the three new
  suites and searched every UUID column in `auth`, `public`, and `private`.
- Final result: `residue_locations = 0`.

All new pgTAP suites remain transaction-scoped and end with `rollback`.

## Live REST freshness gate

The isolated project currently has no persisted Party/Session live API E2E run,
and its Party/Session write flags remain disabled. The repository's live REST
runner requires test-project URL/key material and two user access tokens. Those
credentials are not present in the process environment; `.env.local` points to a
different Supabase project. Terminal policy also prevented retrieving API key
material from the Supabase Management API, so no credential bypass was attempted.

Therefore this evidence confirms the complete cloud database/RPC authority
matrix, but it does not claim a fresh two-device REST release-readiness record.
A future live REST run must use explicitly supplied credentials for project
`ibprkyemsuktfrdpxvza` and preserve the existing fail-closed project-ref checks.

No native build, prebuild, Metro session, or export was run as part of this proof.
