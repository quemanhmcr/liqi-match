create extension if not exists pgtap with schema extensions;

begin;
select plan(41);

grant execute on function private.is_match_intent_lifecycle_projection_ready_v1(uuid, bigint)
  to service_role;
grant select, update on table public.match_intents_v1 to service_role;
grant select on table private.outbox_events to service_role;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  '01000000-0000-4000-8000-000000000901',
  'authenticated',
  'authenticated',
  'lifecycle-projection@example.test',
  'x',
  now(),
  now(),
  now()
);

insert into public.profiles (id, display_name)
values (
  '01000000-0000-4000-8000-000000000901',
  'Lifecycle Projection Player'
);

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
) values (
  '20000000-0000-4000-8000-000000000901',
  '01000000-0000-4000-8000-000000000901',
  '01000000-0000-4000-8000-000000000901',
  'active',
  1,
  true,
  true
);

insert into public.player_profiles_v1 (
  id,
  player_id,
  legacy_profile_id,
  version,
  completed_at
) values (
  '30000000-0000-4000-8000-000000000901',
  '20000000-0000-4000-8000-000000000901',
  '01000000-0000-4000-8000-000000000901',
  4,
  now()
);

insert into public.match_intents_v1 (
  id,
  player_id,
  state,
  filters,
  version,
  activated_at,
  expires_at
) values (
  '10000000-0000-4000-8000-000000000901',
  '20000000-0000-4000-8000-000000000901',
  'active',
  '{"intentKind":"rank","mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["jungle"],"timezone":"Asia/Bangkok"}',
  1,
  now(),
  now() + interval '2 hours'
);

set local role service_role;

select ok(
  private.is_match_intent_lifecycle_projection_ready_v1(
    '20000000-0000-4000-8000-000000000901',
    1
  ),
  'players without lifecycle history remain eligible before the first suspend event'
);

create temporary table suspend_result as
select public.suspend_player_v1(
  jsonb_build_object(
    'expectedLifecycleVersion', 1,
    'idempotencyKey', 'player.suspend.projection.0901.v1',
    'playerId', '20000000-0000-4000-8000-000000000901',
    'reasonCode', 'trust.projection_test'
  )
) as response;

create temporary table suspend_event as
select payload as event
from private.outbox_events
where event_type = 'player.suspended.v1'
  and aggregate_id = '20000000-0000-4000-8000-000000000901';

select is(
  (select response #>> '{lifecycle,state}' from suspend_result),
  'suspended',
  'suspend command returns authoritative suspended state'
);
select is(
  (select (response #>> '{lifecycle,version}')::integer from suspend_result),
  2,
  'suspend command increments lifecycle version'
);
select is(
  (select (response #>> '{lifecycle,discoverable}')::boolean from suspend_result),
  false,
  'suspend command disables discovery immediately'
);
select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'player.suspended.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000901'
  ),
  1,
  'suspend command emits exactly one lifecycle event'
);
select is(
  (
    select contract_version
    from private.outbox_events
    where event_type = 'player.suspended.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000901'
  ),
  1,
  'suspend event uses the Core V1 outbox contract version'
);
select is(
  (
    select deduplication_key
    from private.outbox_events
    where event_type = 'player.suspended.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000901'
  ),
  'player.suspended.v1:20000000-0000-4000-8000-000000000901:2',
  'suspend event has a stable lifecycle-version deduplication key'
);
select is(
  (select event #>> '{data,reasonCode}' from suspend_event),
  'trust.projection_test',
  'suspend event preserves the authoritative reason code'
);

create temporary table suspend_dispatch as
select public.process_pending_match_intent_lifecycle_events_v1(10) as response;

select is(
  (select (response ->> 'selectedCount')::integer from suspend_dispatch),
  1,
  'lifecycle worker selects the unprojected suspend event'
);
select is(
  (select (response ->> 'processedCount')::integer from suspend_dispatch),
  1,
  'lifecycle worker processes the suspend event'
);
select is(
  (select (response ->> 'failedCount')::integer from suspend_dispatch),
  0,
  'lifecycle worker reports no suspend failure'
);
select ok(
  (
    select processed_at is null
    from private.outbox_events
    where event_type = 'player.suspended.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000901'
  ),
  'Match Intent consumer does not claim the shared outbox globally'
);

create temporary table suspend_projection as
select response
from private.match_intent_lifecycle_projection_receipts_v1
where event_id = (select (event ->> 'eventId')::uuid from suspend_event);

select is(
  (select response ->> 'resultCode' from suspend_projection),
  'paused_by_suspension',
  'suspend projection pauses an active Match Intent'
);
select is(
  (
    select state::text
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  'paused',
  'Match Intent state is persisted as paused'
);
select is(
  (
    select version::integer
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  2,
  'suspend projection advances Match Intent version exactly once'
);
select ok(
  (
    select activated_at is null and expires_at is null
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  'suspended Match Intent clears active timestamps'
);
select is(
  private.is_match_intent_lifecycle_projection_ready_v1(
    '20000000-0000-4000-8000-000000000901',
    2
  ),
  false,
  'suspend projection closes Match Intent eligibility gate'
);

create temporary table suspend_projection_retry as
select public.apply_player_lifecycle_to_match_intent_v1(
  (select event from suspend_event)
) as response;

select is(
  (select (response ->> 'repeated')::boolean from suspend_projection_retry),
  true,
  'suspend projection retry returns the stored semantic result'
);
select is(
  (
    select version::integer
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  2,
  'suspend projection retry does not advance intent version'
);
select is(
  (
    select count(*)::integer
    from private.match_intent_lifecycle_projection_receipts_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  1,
  'suspend projection stores one event receipt'
);

create temporary table resume_result as
select public.resume_player_v1(
  jsonb_build_object(
    'expectedLifecycleVersion', 2,
    'idempotencyKey', 'player.resume.projection.0901.v2',
    'playerId', '20000000-0000-4000-8000-000000000901'
  )
) as response;

create temporary table resume_event as
select payload as event
from private.outbox_events
where event_type = 'player.resumed.v1'
  and aggregate_id = '20000000-0000-4000-8000-000000000901';

select is(
  (select response #>> '{lifecycle,state}' from resume_result),
  'active',
  'resume command returns authoritative active state'
);
select is(
  (select (response #>> '{lifecycle,version}')::integer from resume_result),
  3,
  'resume command increments lifecycle version'
);
select is(
  (select (response #>> '{lifecycle,discoverable}')::boolean from resume_result),
  true,
  'resume restores the stored discoverable preference'
);
select is(
  (
    select contract_version
    from private.outbox_events
    where event_type = 'player.resumed.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000901'
  ),
  1,
  'resume event uses the Core V1 outbox contract version'
);
select is(
  (select event ->> 'causationId' from resume_event),
  (select event ->> 'eventId' from suspend_event),
  'resume event is caused by the authoritative suspend event'
);
select is(
  private.is_match_intent_lifecycle_projection_ready_v1(
    '20000000-0000-4000-8000-000000000901',
    3
  ),
  false,
  'active snapshot alone cannot reopen eligibility before resumed event projection'
);

-- Model a delayed resume consumer while a client races an activation command.
-- The resumed event must pause this intent rather than silently granting access.
update public.match_intents_v1
set state = 'active',
    version = 3,
    activated_at = now(),
    expires_at = now() + interval '2 hours'
where player_id = '20000000-0000-4000-8000-000000000901';

create temporary table resume_dispatch as
select public.process_pending_match_intent_lifecycle_events_v1(10) as response;

select is(
  (select (response ->> 'selectedCount')::integer from resume_dispatch),
  1,
  'lifecycle worker selects the unprojected resume event'
);
select is(
  (select (response ->> 'processedCount')::integer from resume_dispatch),
  1,
  'lifecycle worker processes the resume event'
);
select is(
  (select (response ->> 'failedCount')::integer from resume_dispatch),
  0,
  'lifecycle worker reports no resume failure'
);

create temporary table resume_projection as
select response
from private.match_intent_lifecycle_projection_receipts_v1
where event_id = (select (event ->> 'eventId')::uuid from resume_event);

select is(
  (select response ->> 'resultCode' from resume_projection),
  'paused_before_resume_eligibility',
  'delayed resume projection pauses a raced active Match Intent'
);
select is(
  (select (response ->> 'eligibilityRestored')::boolean from resume_projection),
  true,
  'resume event plus active discoverable snapshot restores eligibility gate'
);
select is(
  (
    select state::text
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  'paused',
  'resume never auto-activates a Match Intent'
);
select is(
  (
    select version::integer
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  4,
  'delayed resume projection advances the raced intent once'
);
select ok(
  private.is_match_intent_lifecycle_projection_ready_v1(
    '20000000-0000-4000-8000-000000000901',
    3
  ),
  'resume projection opens eligibility only for the exact lifecycle version'
);

create temporary table resume_projection_retry as
select public.apply_player_lifecycle_to_match_intent_v1(
  (select event from resume_event)
) as response;

select is(
  (select (response ->> 'repeated')::boolean from resume_projection_retry),
  true,
  'resume projection retry returns the stored semantic result'
);
select is(
  (
    select version::integer
    from public.match_intents_v1
    where player_id = '20000000-0000-4000-8000-000000000901'
  ),
  4,
  'resume projection retry does not advance intent version'
);

create temporary table stale_suspend_projection as
select public.apply_player_lifecycle_to_match_intent_v1(
  jsonb_set(
    (select event from suspend_event),
    '{eventId}',
    '"80000000-0000-4000-8000-000000000099"'::jsonb
  )
) as response;

select is(
  (select response ->> 'resultCode' from stale_suspend_projection),
  'stale_event',
  'older lifecycle event is acknowledged without reversing state'
);
select ok(
  private.is_match_intent_lifecycle_projection_ready_v1(
    '20000000-0000-4000-8000-000000000901',
    3
  ),
  'stale suspend event cannot close a newer resumed eligibility gate'
);

select throws_like(
  $$select public.apply_player_lifecycle_to_match_intent_v1(
    jsonb_set(
      (select event from resume_event),
      '{data,reasonCode}',
      '"trust.conflicting_reason"'::jsonb
    )
  )$$,
  '%idempotency_conflict%',
  'reusing an eventId with different lifecycle payload is rejected'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000901',
  true
);
select throws_ok(
  $$select public.apply_player_lifecycle_to_match_intent_v1(
    (select event from resume_event)
  )$$,
  '42501',
  null,
  'client cannot execute the service-only lifecycle projection'
);

select throws_ok(
  $$select public.process_pending_match_intent_lifecycle_events_v1(10)$$,
  '42501',
  null,
  'client cannot execute the service-only lifecycle dispatch worker'
);

reset role;
select * from finish();
rollback;
