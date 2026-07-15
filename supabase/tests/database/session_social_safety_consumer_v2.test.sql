create extension if not exists pgtap with schema extensions;

begin;

select plan(47);

select has_table(
  'private',
  'play_session_consumed_social_events_v2',
  'consumer receipt table exists'
);
select has_table(
  'private',
  'play_session_social_event_failures_v2',
  'consumer failure table exists'
);
select has_table(
  'private',
  'play_session_social_visibility_revocations_v2',
  'durable Session visibility revocation table exists'
);
select has_function(
  'private',
  'consume_play_session_social_event_v2',
  array['jsonb'],
  'block consumer exists'
);
select has_function(
  'public',
  'process_pending_play_session_social_events_v2',
  array['integer'],
  'pending block worker exists'
);
select has_function(
  'public',
  'dispatch_play_session_social_events_v2',
  array['integer'],
  'five-second Session safety dispatcher exists'
);
select function_privs_are(
  'private',
  'consume_play_session_social_event_v2',
  array['jsonb'],
  'authenticated',
  array[]::text[],
  'consumer is not available to authenticated clients'
);
select function_privs_are(
  'public',
  'process_pending_play_session_social_events_v2',
  array['integer'],
  'service_role',
  array['EXECUTE'],
  'worker is service-role only'
);
select is(
  (select schedule from cron.job where jobname = 'play-session-social-safety-v2'),
  '5 seconds',
  'Session safety dispatcher runs every five seconds'
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'play-session-social-safety-v2'),
  active => false
);

update private.party_session_config_v2
set reads_enabled = true,
    creation_writes_enabled = true,
    mutation_writes_enabled = true,
    reconciliation_writes_enabled = true,
    updated_at = now()
where singleton;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000001461', 'authenticated', 'authenticated', 'session-safety-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000001462', 'authenticated', 'authenticated', 'session-safety-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000001463', 'authenticated', 'authenticated', 'session-safety-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000001461', 'Session Safety A'),
  ('01000000-0000-4000-8000-000000001462', 'Session Safety B'),
  ('01000000-0000-4000-8000-000000001463', 'Session Safety C');

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
) values
  ('21000000-0000-4000-8000-000000001461', '01000000-0000-4000-8000-000000001461', '01000000-0000-4000-8000-000000001461', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000001462', '01000000-0000-4000-8000-000000001462', '01000000-0000-4000-8000-000000001462', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000001463', '01000000-0000-4000-8000-000000001463', '01000000-0000-4000-8000-000000001463', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000001461', '21000000-0000-4000-8000-000000001461', '01000000-0000-4000-8000-000000001461', 1, now()),
  ('31000000-0000-4000-8000-000000001462', '21000000-0000-4000-8000-000000001462', '01000000-0000-4000-8000-000000001462', 1, now()),
  ('31000000-0000-4000-8000-000000001463', '21000000-0000-4000-8000-000000001463', '01000000-0000-4000-8000-000000001463', 1, now());

insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, friendship_state, version, removed_at
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000001461',
    '21000000-0000-4000-8000-000000001462'
  ),
  '21000000-0000-4000-8000-000000001461',
  '21000000-0000-4000-8000-000000001462',
  'removed',
  5,
  now()
);

insert into public.player_blocks_v2 (
  relationship_id,
  blocker_player_id,
  blocked_player_id,
  active,
  version,
  reason_code
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000001461',
    '21000000-0000-4000-8000-000000001462'
  ),
  '21000000-0000-4000-8000-000000001461',
  '21000000-0000-4000-8000-000000001462',
  true,
  1,
  'user_safety'
);

insert into public.play_sessions_v2 (
  id, owner_player_id, source_kind, title, capacity, state, version,
  membership_version, timezone, started_at
) values
  ('71000000-0000-4000-8000-000000001461', '21000000-0000-4000-8000-000000001461', 'manual', 'Pending invite safety', 2, 'recruiting', 1, 1, 'Asia/Bangkok', null),
  ('71000000-0000-4000-8000-000000001462', '21000000-0000-4000-8000-000000001461', 'manual', 'Ready safety', 2, 'ready_check', 3, 2, 'Asia/Bangkok', null),
  ('71000000-0000-4000-8000-000000001463', '21000000-0000-4000-8000-000000001461', 'manual', 'Active safety', 2, 'in_progress', 6, 2, 'Asia/Bangkok', now() - interval '30 minutes');

insert into public.play_session_members_v2 (
  session_id, player_id, role, state
) values
  ('71000000-0000-4000-8000-000000001461', '21000000-0000-4000-8000-000000001461', 'owner', 'active'),
  ('71000000-0000-4000-8000-000000001462', '21000000-0000-4000-8000-000000001461', 'owner', 'active'),
  ('71000000-0000-4000-8000-000000001462', '21000000-0000-4000-8000-000000001462', 'member', 'active'),
  ('71000000-0000-4000-8000-000000001463', '21000000-0000-4000-8000-000000001461', 'owner', 'active'),
  ('71000000-0000-4000-8000-000000001463', '21000000-0000-4000-8000-000000001462', 'member', 'active');

insert into public.play_session_invites_v2 (
  id, session_id, inviter_player_id, target_player_id, state, version
) values (
  '72000000-0000-4000-8000-000000001461',
  '71000000-0000-4000-8000-000000001461',
  '21000000-0000-4000-8000-000000001461',
  '21000000-0000-4000-8000-000000001462',
  'pending',
  1
);

insert into public.play_session_ready_checks_v2 (
  id, session_id, state, version, required_membership_version,
  required_player_ids, opened_by_player_id, opened_at, deadline_at
) values (
  '73000000-0000-4000-8000-000000001462',
  '71000000-0000-4000-8000-000000001462',
  'open',
  1,
  2,
  array[
    '21000000-0000-4000-8000-000000001461'::uuid,
    '21000000-0000-4000-8000-000000001462'::uuid
  ],
  '21000000-0000-4000-8000-000000001461',
  now(),
  now() + interval '1 hour'
);

insert into public.play_session_role_assignments_v2 (
  id, session_id, player_id, role_slug, assigned_by_player_id, active, version
) values (
  '74000000-0000-4000-8000-000000001462',
  '71000000-0000-4000-8000-000000001462',
  '21000000-0000-4000-8000-000000001462',
  'support',
  '21000000-0000-4000-8000-000000001461',
  true,
  1
);

create temporary table source_block_event as
select private.enqueue_contract_event_v2(
  'player.blocked.v2',
  'social_relationship',
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000001461',
    '21000000-0000-4000-8000-000000001462'
  ),
  5,
  '21000000-0000-4000-8000-000000001461',
  '75000000-0000-4000-8000-000000001461',
  null,
  jsonb_build_object(
    'blockerPlayerId', '21000000-0000-4000-8000-000000001461',
    'blockedPlayerId', '21000000-0000-4000-8000-000000001462',
    'reasonCode', 'user_safety'
  ),
  'session-social-safety-source-1461'
) as event_id;
grant select on source_block_event to service_role;
create temporary table source_block_payload as
select payload
from private.outbox_events
where id = (select event_id from source_block_event);
grant select on source_block_payload to service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000001462', true);

select throws_like(
  $$select public.get_play_session_v2('71000000-0000-4000-8000-000000001462')$$,
  '%session_visibility_revoked%',
  'live block hides member list before asynchronous event consumption'
);
select throws_like(
  $$select public.respond_ready_check_v2(
    '71000000-0000-4000-8000-000000001462',
    '73000000-0000-4000-8000-000000001462',
    'ready',
    'session.ready.block.1462',
    '75000000-0000-4000-8000-000000001462',
    3,
    jsonb_build_object(
      'appVersion', 'core-v2-test',
      'clientCreatedAt', now(),
      'clientRequestId', '76000000-0000-4000-8000-000000001462',
      'platform', 'android'
    )
  )$$,
  '%session_visibility_revoked%',
  'live block rejects ready response before the worker runs'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table processed_block as
select public.process_pending_play_session_social_events_v2(50) as result;
reset role;

select is(
  (select (result ->> 'processedCount')::integer from processed_block),
  1,
  'one authoritative block event is processed'
);
select is(
  (select jsonb_array_length(result #> '{results,0,actions}') from processed_block),
  3,
  'one block event updates invite, pre-start, and active Sessions'
);
select is(
  (select state::text from public.play_session_invites_v2 where id = '72000000-0000-4000-8000-000000001461'),
  'cancelled',
  'pending Session invite is cancelled'
);
select ok(
  (select responded_at is not null from public.play_session_invites_v2 where id = '72000000-0000-4000-8000-000000001461'),
  'cancelled invite records authoritative response time'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'session.invite_cancelled.v2' and causation_id = (select event_id from source_block_event)),
  1,
  'invite cancellation emits one causally linked event'
);
select is(
  (select state::text from public.play_session_members_v2 where session_id = '71000000-0000-4000-8000-000000001462' and player_id = '21000000-0000-4000-8000-000000001462'),
  'removed',
  'pre-start block removes the non-owner member'
);
select is(
  (select reason_code from public.play_session_members_v2 where session_id = '71000000-0000-4000-8000-000000001462' and player_id = '21000000-0000-4000-8000-000000001462'),
  'relationship_blocked',
  'removed membership records Social safety reason'
);
select is(
  (select state::text from public.play_session_ready_checks_v2 where id = '73000000-0000-4000-8000-000000001462'),
  'cancelled',
  'open ready-check is cancelled by membership revocation'
);
select is(
  (select state::text from public.play_sessions_v2 where id = '71000000-0000-4000-8000-000000001462'),
  'recruiting',
  'pre-start Session returns to recruiting'
);
select is(
  (select membership_version::integer from public.play_sessions_v2 where id = '71000000-0000-4000-8000-000000001462'),
  3,
  'pre-start membership version advances once'
);
select isnt(
  (select active from public.play_session_role_assignments_v2 where id = '74000000-0000-4000-8000-000000001462'),
  true,
  'removed member role assignment is revoked'
);
select is(
  (select count(*)::integer from private.play_session_social_visibility_revocations_v2 where session_id = '71000000-0000-4000-8000-000000001462' and player_id = '21000000-0000-4000-8000-000000001462'),
  1,
  'pre-start removed member receives durable visibility revocation'
);
select is(
  (select state::text from public.play_sessions_v2 where id = '71000000-0000-4000-8000-000000001463'),
  'disputed',
  'in-progress block disputes Session'
);
select is(
  (select count(*)::integer from public.play_session_members_v2 where session_id = '71000000-0000-4000-8000-000000001463' and state = 'active'),
  2,
  'disputed Session preserves both historical active memberships'
);
select is(
  (select count(*)::integer from private.play_session_social_visibility_revocations_v2 where session_id = '71000000-0000-4000-8000-000000001463'),
  2,
  'disputed Session revokes member-list visibility for both blocked players'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'session.safety_disputed.v2' and causation_id = (select event_id from source_block_event)),
  1,
  'active-play dispute emits one causal safety event'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'session.completed.v2' and aggregate_id = '71000000-0000-4000-8000-000000001463'),
  0,
  'safety dispute never fabricates completion'
);
select is(
  (select count(*)::integer from private.play_session_consumed_social_events_v2 where event_id = (select event_id from source_block_event)),
  1,
  'block consumer stores one durable receipt'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table replayed_block as
select private.consume_play_session_social_event_v2(
  (select payload from source_block_payload)
) as result;
reset role;

select is(
  (select (result ->> 'repeated')::boolean from replayed_block),
  true,
  'same event replays without duplicate mutation'
);
select is(
  (select version::integer from public.play_sessions_v2 where id = '71000000-0000-4000-8000-000000001462'),
  4,
  'event replay preserves pre-start Session version'
);
select is(
  (select version::integer from public.play_sessions_v2 where id = '71000000-0000-4000-8000-000000001463'),
  7,
  'event replay preserves disputed Session version'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_like(
  $$select private.consume_play_session_social_event_v2(
    jsonb_set(
      (select payload from source_block_payload),
      '{payload,reasonCode}',
      '"tampered"'::jsonb
    )
  )$$,
  '%event_replay_conflict%',
  'conflicting event replay fails closed'
);
reset role;

update public.player_blocks_v2
set active = false,
    version = version + 1,
    unblocked_at = now(),
    updated_at = now()
where blocker_player_id = '21000000-0000-4000-8000-000000001461'
  and blocked_player_id = '21000000-0000-4000-8000-000000001462';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000001462', true);
select throws_like(
  $$select public.get_play_session_v2('71000000-0000-4000-8000-000000001462')$$,
  '%session_visibility_revoked%',
  'unblock does not restore removed member visibility'
);
select throws_like(
  $$select public.get_play_session_v2('71000000-0000-4000-8000-000000001463')$$,
  '%session_visibility_revoked%',
  'unblock does not restore disputed Session visibility'
);
select is(
  public.list_my_session_invites_v2(20),
  '[]'::jsonb,
  'unblock does not restore cancelled invite'
);
select is(
  public.list_current_play_sessions_v2(20),
  '[]'::jsonb,
  'revoked player current Session list fails closed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000001461', true);
select is(
  public.get_play_session_v2('71000000-0000-4000-8000-000000001462') #>> '{members,1,state}',
  'removed',
  'non-revoked owner retains authoritative removed-member history'
);
select throws_like(
  $$select public.get_play_session_v2('71000000-0000-4000-8000-000000001463')$$,
  '%session_visibility_revoked%',
  'both sides of active-play block lose public member-list access'
);
reset role;

select is(
  (select count(*)::integer from public.play_session_members_v2 where session_id = '71000000-0000-4000-8000-000000001462' and player_id = '21000000-0000-4000-8000-000000001462' and state = 'active'),
  0,
  'unblock never restores Session membership'
);
select is(
  (select count(*)::integer from public.play_session_ready_responses_v2 where ready_check_id = '73000000-0000-4000-8000-000000001462'),
  0,
  'blocked ready response leaves no persisted readiness'
);
select is(
  (select count(*)::integer from private.play_session_social_visibility_revocations_v2),
  3,
  'unblock never deletes durable Session visibility revocations'
);

create temporary table malformed_block_event as
select private.enqueue_contract_event_v2(
  'player.blocked.v2',
  'social_relationship',
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000001461',
    '21000000-0000-4000-8000-000000001462'
  ),
  6,
  '21000000-0000-4000-8000-000000001461',
  '75000000-0000-4000-8000-000000001469',
  null,
  '{}'::jsonb,
  'session-social-safety-malformed-1469'
) as event_id;
grant select on malformed_block_event to service_role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table malformed_result as
select public.process_pending_play_session_social_events_v2(50) as result;
reset role;

select is(
  (select (result ->> 'processedCount')::integer from malformed_result),
  1,
  'malformed event is isolated into one retry result'
);
select is(
  (select count(*)::integer from private.play_session_social_event_failures_v2 where event_id = (select event_id from malformed_block_event)),
  1,
  'malformed event enters retry ledger'
);
select is(
  (select attempt_count from private.play_session_social_event_failures_v2 where event_id = (select event_id from malformed_block_event)),
  1,
  'first malformed attempt records deterministic attempt count'
);
select is(
  (select status::text from private.outbox_events where id = (select event_id from malformed_block_event)),
  'pending',
  'Session consumer does not own shared outbox status'
);
select ok(
  (select available_at > now() from private.play_session_social_event_failures_v2 where event_id = (select event_id from malformed_block_event)),
  'malformed event receives delayed retry backoff'
);

select * from finish(true);
rollback;
