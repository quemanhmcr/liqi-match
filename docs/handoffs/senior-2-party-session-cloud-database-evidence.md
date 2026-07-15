# Senior 2 handoff: Party/Session cloud database evidence

Date: 2026-07-15 (Asia/Bangkok)
Owner: Senior 2 — Party, Set, and Play Session
Branch: `ready/senior-2`

## Dedicated test project

This proof ran only against the shared cross-team Supabase cloud E2E project. It did not use staging or production data.

- Project name: `liqi-conversation-v2-e2e-217c84e`
- Project ref: `ibprkyemsuktfrdpxvza`
- Region: Singapore (`ap-southeast-1`)
- Supabase CLI: `2.109.1`
- PostgreSQL major version: 17

No credentials are stored in this document, the runner, SQL fixtures, Git history, or test output.

After the proof, `supabase db push --linked --include-all --dry-run` reported:

```text
Remote database is up to date.
```

The linked local and remote migration histories matched through `202607150131` at the final verification checkpoint.

## Re-run

The runner refuses to execute unless the explicitly approved project ref equals the locally linked ref.

```bash
npx --yes supabase@2.109.1 link --project-ref ibprkyemsuktfrdpxvza
npm run e2e:party-session:cloud-db -- --project-ref ibprkyemsuktfrdpxvza
```

Expected final marker:

```text
ALL_PARTY_SESSION_CLOUD_DB_PASS suites=6 assertions=213 project_ref=ibprkyemsuktfrdpxvza
```

Transient connection failures receive at most three bounded attempts. SQL, permission, contract, plan, and assertion failures are never treated as successful retries.

## Cloud PostgreSQL proof

| Suite                                         | Assertions |
| --------------------------------------------- | ---------: |
| `match_set_authority_v1.test.sql`             |         31 |
| `repeat_play_session_consumer_v2.test.sql`    |         12 |
| `core_v2_completed_session_consumer.test.sql` |         36 |
| `session_social_safety_consumer_v2.test.sql`  |         47 |
| `party_session_release_readiness_v2.test.sql` |         29 |
| `party_session_runtime_v2.test.sql`           |         58 |
| **Total**                                     |    **213** |

All suites executed through `supabase db query --linked` on cloud PostgreSQL. Each suite validates its pgTAP plan and rolls back authority test data.

## Two-actor runtime journey

The 58-assertion runtime suite executes the real database RPC and consumer chain with authenticated actor A, authenticated actor B, and service-role consumers:

1. Actor A creates a manual Session and replays the same command idempotently.
2. One recruiting Session is persisted with exactly one active owner.
3. Actor B sees the pending invite and accepts it.
4. Session and membership versions advance independently.
5. Conversation V2 consumes `session.member_joined.v2`, provisions one conversation, acknowledges membership version two, and replays without duplication.
6. Actor A opens ready check. Actor B first submits a stale version and is rejected; both actors then submit readiness at refreshed versions.
7. Ready quorum passes, the Session becomes scheduled, and the owner starts it.
8. Actor A completion moves the Session to `completion_pending`; actor B completion satisfies participant quorum.
9. Exactly one `session.completed.v2` carries both participants and `verification=participant_quorum`.
10. Trust creates one outcome and two feedback activity items and remains idempotent on replay.
11. Conversation projects completion activity on the same canonical conversation and consumes source events exactly once.
12. Both actors independently read the same completed Session and conversation.
13. Eight command-audit records and twelve Session events are retained.

## Cloud-only issues found and corrected

### PostgreSQL 17 JSONB validation

Migration `202607141410` used `jsonb_object_length(jsonb)`, which is unavailable on the cloud PostgreSQL 17 instance. Exact-key validation now counts `jsonb_object_keys(...)` and fails closed for non-object JSON. The suite increased from 34 to 36 assertions.

### Test-role isolation

The cloud login role owns pgTAP temporary tables. Switching to `service_role` does not grant access automatically. Safety tests now grant only transaction-scoped read access to two temporary evidence tables. Production private grants remain unchanged.

### Private outbox boundary

`service_role` correctly cannot select the private outbox directly. The runtime harness captures authoritative envelopes through transaction-scoped security-definer helpers, then passes only those envelopes to production consumers. No production grant was widened.

### Transaction-scoped timestamps

PostgreSQL `now()` is fixed at transaction start. A composed lifecycle could produce `completedAt = startedAt`, and an event could have `occurredAt < completedAt`.

Corrections:

- Fresh installs use wall-clock timestamps in the original Session and Core V2 event migrations.
- `202607142103_party_session_action_timestamps_v2.sql` corrects deployed start/completion RPCs and preserves strict ordering.
- `202607142104_core_v2_event_wall_clock_v2.sql` corrects deployed event emission.

The final runtime suite passed after both deployed corrections.

## Scope boundary

This proves cloud PostgreSQL functions, triggers, grants, role switching, idempotency, optimistic concurrency, event envelopes, Conversation reconciliation, Trust fan-out, and rollback-only release checks. It does not claim a physical-device run or a held-open Realtime socket.
