# Core V2 Social Relationship & Safety operations

## Scope and authority

This runbook operates the Senior 1 authority only:

- Core V1 `PlayerId` and player lifecycle remain the identity authority.
- Social owns friendship, directional block, directional mute, Social privacy,
  report initiation, receipts, audit metadata and Social outbox events.
- Conversation owns conversation membership, delivery, realtime revocation and
  privileged message evidence.
- Party/Session owns Set, membership, ready-check and play-session lifecycle.
- Trust owns completed-session outcomes, endorsements and reputation.

Never use `auth.uid()` as a `PlayerId`, never create a second friendship or block
semantic, and never treat `report.submitted.v2` as a public reputation outcome.

## Migration order

Apply the forward-only Social chain in repository order. Do not rename or squash
individual migrations after any environment has applied them.

```text
202607140052  Social relationship foundation and legacy block backfill
202607140053  Trust visibility decision
202607140055  Friendship commands
202607140056  Block, unblock, mute and unmute commands
202607140057  Privacy and report authority
202607140061  Legacy consumer block bridge
202607140062  Profile visibility and canonical identity bridge
202607141255  Canonical blocked-player list
202607141310  Friendship notification enum contract
202607141311  Friendship notification projection
202607142100  Immutable V1 message-report evidence compatibility
```

Conversation V2 may also install `202607140058` and the strict evidence DTO
alignment migration `202607141320`. Migration `202607142100` is compatible with
both states: it captures Core V1 evidence and delegates V2 evidence to the
Conversation-owned tables without redefining Conversation semantics.

## Mandatory source gate

Before touching an environment, from the repository root run:

```bash
npm run social-release:check
npm run task:check
```

`task:check` is source-level evidence only. It does not replace executing the
migrations, database lint or pgTAP against a real Postgres instance.

## Live database verification

The release operator runs these commands. Do not continue after any failure:

```bash
supabase db reset
supabase db lint
supabase test db
supabase gen types typescript --local > src/shared/types/database.types.ts
```

Review generated-type changes before commit. A generated diff is evidence of a
schema contract change, not formatting noise.

## Feature gates and rollout order

The authority has one row in `private.social_authority_config_v2`:

- `reads_enabled`
- `writes_enabled`
- `legacy_block_shadow_reads_enabled`

The safe rollout is:

1. Apply additive tables, backfill and consumer bridges with `writes_enabled = false`.
2. Keep `legacy_block_shadow_reads_enabled = true` and verify canonical/legacy
   block parity.
3. Verify Profile, Discover, Conversation, Notification, Trust and Party/Session
   consumer checkpoints in staging.
4. Enable Social writes while keeping legacy shadow reads enabled.
5. Observe at least one normal release window with zero unexplained parity gaps.
6. Disable legacy shadow reads only after the release owner records parity evidence.

```sql
update private.social_authority_config_v2
set reads_enabled = true,
    writes_enabled = false,
    legacy_block_shadow_reads_enabled = true,
    updated_at = now()
where singleton;
```

Enable mutations only after the preflight and consumer checkpoints are green:

```sql
update private.social_authority_config_v2
set writes_enabled = true,
    updated_at = now()
where singleton;
```

## Consumer checkpoint evidence

Production cutover is prohibited until every row below has a commit reference,
passing provider/consumer tests and a staging observation:

| Checkpoint            | Required evidence                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1.2 Profile/Discover | canonical `PlayerId` route, V2 relationship action receipt, block removes Discover/Profile visibility                                                                                        |
| S1.3 Conversation     | fetch, send, realtime subscription and push fail closed after block; historical evidence remains reportable                                                                                  |
| S1.4 Session          | invite and join denied; pre-start membership/readiness/member visibility revoked; in-progress/completion-pending becomes disputed; replay is idempotent; unblock does not restore membership |
| S1/S4 Trust           | block hides trust/repeat candidates; friendship/report/block never create a public ledger fact                                                                                               |

**Current release rule:** S1.4 must have a consumer-owner commit and tests before
`writes_enabled` may be enabled in production. Invite-only enforcement is not
sufficient evidence for this checkpoint.

## Canonical block parity

Run with service role. The first query must return zero rows before disabling
legacy shadow reads:

```sql
with canonical as (
  select
    blocker.legacy_profile_id as blocker_id,
    blocked.legacy_profile_id as blocked_id
  from public.player_blocks_v2 block_rows
  join public.player_profiles_v1 blocker
    on blocker.player_id = block_rows.blocker_player_id
  join public.player_profiles_v1 blocked
    on blocked.player_id = block_rows.blocked_player_id
  where block_rows.active
), legacy as (
  select blocker_id, blocked_id from public.blocks
)
select 'canonical_only' as mismatch, canonical.*
from canonical
left join legacy using (blocker_id, blocked_id)
where legacy.blocker_id is null
union all
select 'legacy_only' as mismatch, legacy.*
from legacy
left join canonical using (blocker_id, blocked_id)
where canonical.blocker_id is null;
```

Inspect dual-write and mapping telemetry:

```sql
select metric_name, count(*) as occurrences, max(occurred_at) as latest
from private.social_authority_metrics_v2
where metric_name in (
  'legacy_block_dual_write',
  'legacy_block_mapping_missing',
  'report_submission_completed'
)
group by metric_name
order by metric_name;
```

`legacy_block_mapping_missing` must be zero for the release population. Every
successful block/unblock during dual-write must have a corresponding
`legacy_block_dual_write` fact unless an explicitly documented account is
outside the legacy mapping population.

## Two-account staging journey

Use two distinct canonical accounts A and B. Record all command correlation IDs
and aggregate versions.

1. A opens B's profile and sends a friend request.
2. Repeat the same command after a simulated timeout; the receipt, request ID and
   event ID must be unchanged.
3. B receives one notification, opens A by canonical `PlayerId`, and accepts.
4. Both devices refresh and see `friend`; neither infers friendship from chat or
   a completed session.
5. A and B exchange messages. Capture the current conversation/session access.
6. A blocks B.
7. Within five seconds B disappears from Discover/Profile and loses send,
   conversation subscription, session invitation and presence capability.
8. A can still report an historical incoming message. A capture timeout must
   retain the report receipt and retry evidence only when connectivity returns.
9. Validate the S1.4 Session policy for an existing pre-start session and an
   in-progress session.
10. A unblocks B. Friendship, conversation access and Session membership must not
    be restored automatically.
11. B's old friendship notification deep link must fail closed after block.
12. Change privacy to `nobody`/`private` and prove stale cached clients cannot
    create friendship/session/trust capabilities.

A release is not approved if any step depends on message text, a legacy profile
ID, client-computed friendship, or cached client capability.

## Block revocation latency

The success target is block-to-online-consumer revocation below five seconds.
Measure from the authoritative `player.blocked.v2.occurredAt` to each consumer's
confirmed denial timestamp. Record Profile/Discover, Conversation realtime,
Notification and Session separately. A missing consumer observation is a failed
measurement, not a zero-latency success.

## Message report evidence checks

For a successful message report:

- one `reports_v2` row exists;
- one Social `report_evidence_v2` reference exists;
- one immutable Conversation evidence row exists for the active conversation
  authority;
- retrying the report returns the same `reportId` and does not create another
  report or evidence row;
- the strict evidence DTO does not duplicate `reportId`;
- a different account cannot read evidence by guessing the report UUID;
- update/delete of immutable evidence is rejected;
- no `reputationDelta` is present in `report.submitted.v2`.

## Health checks

Alert or stop rollout when any condition is true:

- `legacy_block_mapping_missing > 0` for an expected legacy-mapped player;
- canonical/legacy block parity query returns a row;
- duplicate friendship request rows exist for one relationship;
- command receipt replay changes event IDs or aggregate version;
- any blocked consumer returns an elevated capability;
- block revocation exceeds five seconds;
- report completion telemetry is missing for a returned report receipt;
- an unknown Social contract/event version is accepted rather than failing closed.

## Rollback drill

Rollback never drops or deletes canonical relationship, report, receipt, event,
evidence or audit history.

First stop new Social mutations:

```sql
update private.social_authority_config_v2
set writes_enabled = false,
    updated_at = now()
where singleton;
```

If the new read authority is unsafe, restore the legacy block compatibility seam:

```sql
update private.social_authority_config_v2
set reads_enabled = false,
    legacy_block_shadow_reads_enabled = true,
    updated_at = now()
where singleton;
```

Then verify:

- friendship/privacy/report mutation RPCs fail with stable feature-disabled errors;
- legacy block reads still hide blocked users where the compatibility seam applies;
- Conversation and Session consumers fail closed when Social capability is
  unavailable; they must not assume `friend` or `not blocked`;
- existing Social outbox events remain replayable after re-enable;
- report evidence remains readable by the original reporter;
- no canonical table or outbox row was truncated or dropped.

Re-enable reads before writes, repeat the parity query and the two-account smoke
journey, then enable writes. Never repair rollback by deleting canonical history
or manually changing aggregate versions.

## Release evidence record

Attach to the release ticket:

- repository commit and migration tail;
- output of `social-release:check` and `task:check`;
- live `db reset`, `db lint`, pgTAP and generated-types results;
- parity query output;
- S1.2, S1.3, S1.4 and S1/S4 consumer commit references;
- two-account journey correlation IDs/screenshots/logs;
- block revocation latency measurements;
- rollback drill timestamps and operator.
