# Senior 3 handoff: Conversation V2 cloud database evidence

Date: 2026-07-15 (Asia/Bangkok)
Owner: Senior 3 — Conversation and Live Coordination
Branch: `ready/senior-3-conversation-v2`

## Test project

A dedicated Supabase cloud project was created for this proof. It is not the
staging or production project.

- Project name: `liqi-conversation-v2-e2e-217c84e`
- Project ref: `ibprkyemsuktfrdpxvza`
- Region: Singapore (`ap-southeast-1`)
- Supabase CLI used: `2.109.1`
- PostgreSQL image reported by the CLI: `17.6.1.141`
- Realtime health at final verification: `ACTIVE_HEALTHY`

The database password, access token, anon key, and service-role key are not in
the repository, Git history, test SQL, or committed evidence. Reviewers with
organization access must obtain the database password through the approved
secret channel before linking the project.

## What the fresh cloud project found

The cloud run found issues that the static SQL parser could not detect:

1. A newly provisioned project exposed Postgres/Auth/REST before the Realtime
   tenant schema was bootstrapped. Migration `202607140021` therefore failed on
   `realtime.messages`. The project was not migrated further until the official
   Realtime service health/config path had bootstrapped `realtime.messages`,
   `realtime.topic()`, `realtime.send(...)`, and
   `realtime.broadcast_changes(...)`.
2. Migration `202607140058` used untyped `CASE` expressions for enum columns.
   PostgreSQL rejected the resulting `text` values for
   `conversation_state_v2` and `conversation_member_state_v2`. The migration
   now casts every conditional enum branch explicitly.
3. Migration `202607140058` used `min(uuid)` and `max(uuid)` during V1 direct-pair
   backfill. PostgreSQL 17 does not provide those aggregates. The backfill now
   uses deterministic `array_agg(player_id order by player_id)` and verifies
   exactly two distinct PlayerIds.

Every failed migration attempt rolled back transactionally. At the initial
fresh-project checkpoint, all 79 repository migrations applied to the dedicated
cloud database and a subsequent dry run reported the remote database up to date.

After Senior 1 and Senior 2 merged, this PR was rebuilt on `main` and the same
six suites were run again successfully. The local release gate now validates
107 migrations. The shared cloud project currently also contains four later
remote-only migration versions (`202607150135`, `202607150200`, `202607150201`,
and `202607150300`), so the latest dry run correctly refuses to claim migration
parity. No migration-history repair was attempted: this PR adds no migration
files, and changing shared remote history would risk interfering with the next
workstream.

## Cloud database proof

Six pgTAP suites execute through `supabase db query --linked`, so all SQL,
functions, triggers, grants, RLS expressions, command receipts, and mutations
run on the Supabase cloud PostgreSQL instance rather than a parser or mock.
Every suite uses `finish(true)` and the runner rejects `not ok`, plan mismatch,
missing final assertion, or non-zero CLI exit.

| Suite                                         | Assertions |
| --------------------------------------------- | ---------: |
| `conversation_authority_v2.test.sql`          |         60 |
| `conversation_bootstrap_dispatch_v1.test.sql` |          7 |
| `conversation_mobile_surface_v2.test.sql`     |         26 |
| `conversation_reliability_v1.test.sql`        |         46 |
| `conversation_report_evidence_v2.test.sql`    |          4 |
| `conversation_runtime_v2.test.sql`            |         27 |
| **Total**                                     |    **170** |

The 27-assertion runtime suite proves on the real cloud database:

- service-role direct-conversation provisioning and durable replay receipts;
- exactly two canonical PlayerId members and no duplicate aggregate on retry;
- actor A send, sequence allocation, aggregate-version increment, and queued
  recipient receipt;
- semantic `clientMessageId` replay before stale-version validation;
- conflicting content for the same `clientMessageId` rejection;
- actor B stale aggregate rejection, then successful retry at the refreshed
  version with sequence two;
- independent read-cursor versioning and receipt transition to `read`;
- active message-topic authorization and player-scoped access-topic isolation;
- immediate message/read/send revocation for a removed member;
- historical-member access-topic authorization retained only for the removed
  player so revocation can be delivered;
- RLS behavior using a rollback-only harness table with the exact production
  message/access policy expressions. The structural suite separately proves
  those policies are installed on `realtime.messages`.

The Realtime tenant had no message partitions because no socket client was held
open during this non-app proof, and the Management API login role is not allowed
to create objects in the `realtime` schema. The RLS harness therefore exercises
the exact production expressions without changing Realtime ownership or grants.

## Re-run

Link only the dedicated test project, then run:

```bash
npx --yes supabase@2.109.1 link --project-ref ibprkyemsuktfrdpxvza
npm run e2e:conversation:cloud-db -- --project-ref ibprkyemsuktfrdpxvza
```

The runner refuses to execute unless the explicitly approved project ref equals
the locally linked ref. Expected final marker:

```text
ALL_CONVERSATION_CLOUD_DB_PASS suites=6 assertions=170 project_ref=ibprkyemsuktfrdpxvza
```

For a brand-new project, verify the Realtime tenant objects exist before pushing
application migrations:

```sql
select
  to_regclass('realtime.messages') as messages,
  to_regprocedure('realtime.topic()') as topic_function,
  to_regprocedure(
    'realtime.broadcast_changes(text,text,text,text,text,record,record,text)'
  ) as broadcast_function;
```

Do not push migration `202607140021` or later until all three values are non-null.

## Ownership and cleanup

The project is intentionally left active for cross-team review. Delete it after
all reviewers have reproduced the 170-assertion gate or transfer ownership to
the team maintaining the shared integration environment. Do not reuse this
project for staging or production data.
