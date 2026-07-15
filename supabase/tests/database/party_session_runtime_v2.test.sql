create extension if not exists pgtap with schema extensions;

begin;
select plan(58);

select has_function(
  'public',
  'create_play_session_v2',
  array[
    'text', 'integer', 'uuid[]', 'timestamp with time zone', 'text',
    'text', 'uuid', 'bigint', 'jsonb'
  ],
  'manual Session creation RPC exists'
);
select has_function(
  'public',
  'accept_session_invite_v2',
  array['uuid', 'uuid', 'text', 'uuid', 'bigint', 'jsonb'],
  'Session invite acceptance RPC exists'
);
select has_function(
  'public',
  'consume_session_conversation_event_v2',
  array['jsonb'],
  'Conversation V2 consumes Session events'
);
select has_function(
  'private',
  'consume_session_completed_v2',
  array['jsonb'],
  'Trust V2 consumes completed Session events'
);

create or replace function public.test_get_party_outbox_event_v2(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select events.payload
  from private.outbox_events events
  where events.id = p_event_id;
$$;

create or replace function public.test_get_party_outbox_event_by_type_v2(
  p_aggregate_id uuid,
  p_event_type text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select events.payload
  from private.outbox_events events
  where events.aggregate_id = p_aggregate_id
    and events.event_type = p_event_type
  order by events.created_at, events.id
  limit 1;
$$;

create or replace function public.test_count_party_outbox_events_v2(
  p_aggregate_id uuid,
  p_event_type text default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from private.outbox_events events
  where events.aggregate_id = p_aggregate_id
    and (p_event_type is null or events.event_type = p_event_type);
$$;

create or replace function public.test_count_party_conversation_events_v2(
  p_session_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from private.conversation_consumed_events_v2 consumed
  join private.outbox_events events on events.id = consumed.event_id
  where events.aggregate_type = 'play_session'
    and events.aggregate_id = p_session_id;
$$;

grant execute on function public.test_get_party_outbox_event_v2(uuid)
  to authenticated, service_role;
grant execute on function public.test_get_party_outbox_event_by_type_v2(uuid, text)
  to authenticated, service_role;
grant execute on function public.test_count_party_outbox_events_v2(uuid, text)
  to authenticated, service_role;
grant execute on function public.test_count_party_conversation_events_v2(uuid)
  to authenticated, service_role;

update private.party_session_config_v2
set reads_enabled = true,
    creation_writes_enabled = true,
    mutation_writes_enabled = true,
    reconciliation_writes_enabled = true,
    updated_at = now()
where singleton;

update private.conversation_authority_config_v2
set reads_enabled = true,
    writes_enabled = true,
    provisioning_enabled = true,
    realtime_enabled = true,
    updated_at = now()
where singleton;

update private.trust_authority_config_v2
set reads_enabled = true,
    writes_enabled = true,
    feedback_prompts_enabled = true,
    activity_enabled = true,
    repeat_play_enabled = true,
    updated_at = now()
where singleton;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('11000000-0000-4000-8000-000000001601', 'authenticated', 'authenticated', 'party-runtime-a@example.test', 'x', now(), now(), now()),
  ('11000000-0000-4000-8000-000000001602', 'authenticated', 'authenticated', 'party-runtime-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('11000000-0000-4000-8000-000000001601', 'Party Runtime A'),
  ('11000000-0000-4000-8000-000000001602', 'Party Runtime B');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000001601', '11000000-0000-4000-8000-000000001601', '11000000-0000-4000-8000-000000001601', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000001602', '11000000-0000-4000-8000-000000001602', '11000000-0000-4000-8000-000000001602', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000001601', '21000000-0000-4000-8000-000000001601', '11000000-0000-4000-8000-000000001601', 1, now()),
  ('31000000-0000-4000-8000-000000001602', '21000000-0000-4000-8000-000000001602', '11000000-0000-4000-8000-000000001602', 1, now());

update public.player_privacy_settings_v2
set session_invites = 'everyone',
    version = version + 1,
    updated_at = now()
where player_id in (
  '21000000-0000-4000-8000-000000001601',
  '21000000-0000-4000-8000-000000001602'
);

create temporary table runtime_results (
  label text primary key,
  result jsonb not null
);
create temporary table runtime_events (
  label text primary key,
  payload jsonb not null
);
grant all on runtime_results to authenticated, service_role;
grant all on runtime_events to authenticated, service_role;

create or replace function pg_temp.runtime_audit(p_sequence integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'appVersion', 'party-session-cloud-e2e',
    'clientCreatedAt', now(),
    'clientRequestId',
      '96000000-0000-4000-8000-' || lpad(p_sequence::text, 12, '0'),
    'deviceInstallationId',
      '97000000-0000-4000-8000-' || lpad(p_sequence::text, 12, '0'),
    'platform', 'android'
  );
$$;
grant execute on function pg_temp.runtime_audit(integer)
  to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001601', true);
insert into runtime_results (label, result)
select 'create', public.create_play_session_v2(
  'Cloud runtime duo',
  2,
  array['21000000-0000-4000-8000-000000001602'::uuid],
  null,
  'Asia/Bangkok',
  'party.runtime.create.1601',
  '95000000-0000-4000-8000-000000001601',
  0,
  pg_temp.runtime_audit(1)
);
insert into runtime_results (label, result)
select 'create_replay', public.create_play_session_v2(
  'Cloud runtime duo',
  2,
  array['21000000-0000-4000-8000-000000001602'::uuid],
  null,
  'Asia/Bangkok',
  'party.runtime.create.1601',
  '95000000-0000-4000-8000-000000001601',
  0,
  pg_temp.runtime_audit(1)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'create'),
  'created',
  'actor A creates a manual Session'
);
select is(
  (select (result ->> 'repeated')::boolean from runtime_results where label = 'create'),
  false,
  'first create is not a replay'
);
select is(
  (select (result ->> 'repeated')::boolean from runtime_results where label = 'create_replay'),
  true,
  'same create command replays idempotently'
);
select is(
  (select result ->> 'aggregateId' from runtime_results where label = 'create_replay'),
  (select result ->> 'aggregateId' from runtime_results where label = 'create'),
  'create replay returns the same PlaySessionId'
);
select is(
  (select count(*)::integer
   from public.play_sessions_v2 sessions
   where sessions.id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   )),
  1,
  'create replay persists one Session aggregate'
);
select is(
  (select state::text
   from public.play_sessions_v2 sessions
   where sessions.id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   )),
  'recruiting',
  'new Session is recruiting'
);
select is(
  (select count(*)::integer
   from public.play_session_members_v2 members
   where members.session_id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   ) and members.role = 'owner' and members.state = 'active'),
  1,
  'new Session has exactly one active owner'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001602', true);
insert into runtime_results (label, result)
select 'invites', public.list_my_session_invites_v2(20);
reset role;

select is(
  (select jsonb_array_length(result) from runtime_results where label = 'invites'),
  1,
  'actor B sees exactly one pending Session invite'
);
select is(
  (select result #>> '{0,targetPlayerId}' from runtime_results where label = 'invites'),
  '21000000-0000-4000-8000-000000001602',
  'invite targets canonical actor B PlayerId'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001602', true);
insert into runtime_results (label, result)
select 'accept', public.accept_session_invite_v2(
  (select (result #>> '{0,sessionId}')::uuid from runtime_results where label = 'invites'),
  (select (result #>> '{0,inviteId}')::uuid from runtime_results where label = 'invites'),
  'party.runtime.accept.1602',
  '95000000-0000-4000-8000-000000001602',
  (select (result #>> '{0,session,version}')::bigint from runtime_results where label = 'invites'),
  pg_temp.runtime_audit(2)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'accept'),
  'invite_accepted',
  'actor B accepts the authoritative invite'
);
select is(
  (select (result ->> 'aggregateVersion')::integer from runtime_results where label = 'accept'),
  2,
  'invite acceptance advances Session version'
);
select is(
  (select (result #>> '{session,membershipVersion}')::integer from runtime_results where label = 'accept'),
  2,
  'invite acceptance advances membership version'
);
select is(
  (select count(*)::integer
   from public.play_session_members_v2 members
   where members.session_id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   ) and members.state = 'active'),
  2,
  'Session now has two active participants'
);

insert into runtime_events (label, payload)
select
  'member_joined',
  public.test_get_party_outbox_event_v2(
    (select (result #>> '{eventIds,0}')::uuid
     from runtime_results where label = 'accept')
  );

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into runtime_results (label, result)
select 'conversation_join', public.consume_session_conversation_event_v2(
  (select payload from runtime_events where label = 'member_joined')
);
insert into runtime_results (label, result)
select 'conversation_join_replay', public.consume_session_conversation_event_v2(
  (select payload from runtime_events where label = 'member_joined')
);
reset role;

select is(
  (select (result ->> 'repeated')::boolean from runtime_results where label = 'conversation_join'),
  false,
  'Conversation consumer provisions on first member-joined event'
);
select ok(
  (select nullif(result ->> 'conversationId', '') is not null
   from runtime_results where label = 'conversation_join'),
  'Conversation consumer returns a canonical ConversationId'
);
select is(
  (select (result #>> '{acknowledgement,acknowledgementPending}')::boolean
   from runtime_results where label = 'conversation_join'),
  false,
  'Conversation membership acknowledgement completes'
);
select is(
  (select state::text
   from private.play_session_conversation_projection_v2 projections
   where projections.session_id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   )),
  'ready',
  'Session communication projection becomes ready'
);
select is(
  (select membership_version::integer
   from private.play_session_conversation_projection_v2 projections
   where projections.session_id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   )),
  2,
  'Conversation projection acknowledges membership version two'
);
select is(
  (select count(*)::integer
   from public.conversation_members_v2 members
   where members.conversation_id = (
     select (result ->> 'conversationId')::uuid
     from runtime_results where label = 'conversation_join'
   ) and members.state = 'active' and members.can_view_conversation),
  2,
  'Conversation contains both active Session members'
);
select is(
  (select (result ->> 'repeated')::boolean
   from runtime_results where label = 'conversation_join_replay'),
  true,
  'Conversation event replay is idempotent'
);
select is(
  (select count(*)::integer
   from public.conversation_sources_v2 sources
   where sources.source_type = 'play_session'
     and sources.source_id = (
       select (result ->> 'aggregateId')::uuid
       from runtime_results where label = 'create'
     )),
  1,
  'Session owns exactly one Conversation source mapping'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001601', true);
insert into runtime_results (label, result)
select 'open_ready', public.open_ready_check_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
  now() + interval '30 minutes',
  'party.runtime.ready-open.1601',
  '95000000-0000-4000-8000-000000001603',
  2,
  pg_temp.runtime_audit(3)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'open_ready'),
  'ready_check_opened',
  'actor A opens a ready check'
);
select is(
  (select result #>> '{session,state}' from runtime_results where label = 'open_ready'),
  'ready_check',
  'Session enters ready-check state'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001602', true);
select throws_like(
  $$select public.respond_ready_check_v2(
    (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
    (select (result #>> '{session,readyCheck,checkId}')::uuid from runtime_results where label = 'open_ready'),
    'ready',
    'party.runtime.ready-stale.1602',
    '95000000-0000-4000-8000-000000001604',
    2,
    pg_temp.runtime_audit(4)
  )$$,
  '%version_conflict%',
  'actor B stale ready response is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001601', true);
insert into runtime_results (label, result)
select 'ready_a', public.respond_ready_check_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
  (select (result #>> '{session,readyCheck,checkId}')::uuid from runtime_results where label = 'open_ready'),
  'ready',
  'party.runtime.ready-a.1601',
  '95000000-0000-4000-8000-000000001605',
  3,
  pg_temp.runtime_audit(5)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'ready_a'),
  'ready_recorded',
  'actor A readiness is recorded without premature quorum'
);
select is(
  (select (result ->> 'aggregateVersion')::integer from runtime_results where label = 'ready_a'),
  4,
  'first ready response advances Session version once'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001602', true);
insert into runtime_results (label, result)
select 'ready_b', public.respond_ready_check_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
  (select (result #>> '{session,readyCheck,checkId}')::uuid from runtime_results where label = 'open_ready'),
  'ready',
  'party.runtime.ready-b.1602',
  '95000000-0000-4000-8000-000000001606',
  4,
  pg_temp.runtime_audit(6)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'ready_b'),
  'ready_check_passed',
  'actor B readiness completes quorum'
);
select is(
  (select result #>> '{session,state}' from runtime_results where label = 'ready_b'),
  'scheduled',
  'ready quorum schedules the Session'
);
select is(
  (select result #>> '{session,readyCheck,state}' from runtime_results where label = 'ready_b'),
  'passed',
  'ready check closes as passed'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001601', true);
insert into runtime_results (label, result)
select 'start', public.start_session_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
  'party.runtime.start.1601',
  '95000000-0000-4000-8000-000000001607',
  (select (result ->> 'aggregateVersion')::bigint from runtime_results where label = 'ready_b'),
  pg_temp.runtime_audit(7)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'start'),
  'started',
  'owner starts the scheduled Session'
);
select is(
  (select result #>> '{session,state}' from runtime_results where label = 'start'),
  'in_progress',
  'Session enters in-progress state'
);
select ok(
  (select nullif(result #>> '{session,startedAt}', '') is not null
   from runtime_results where label = 'start'),
  'Session start time is authoritative'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001601', true);
insert into runtime_results (label, result)
select 'completion_a', public.propose_session_completion_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
  'completed',
  null,
  'party.runtime.complete-a.1601',
  '95000000-0000-4000-8000-000000001608',
  (select (result ->> 'aggregateVersion')::bigint from runtime_results where label = 'start'),
  pg_temp.runtime_audit(8)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'completion_a'),
  'completion_pending',
  'first completion claim does not complete without quorum'
);
select is(
  (select result #>> '{session,state}' from runtime_results where label = 'completion_a'),
  'completion_pending',
  'Session exposes completion-pending state'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001602', true);
insert into runtime_results (label, result)
select 'completion_b', public.propose_session_completion_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create'),
  'completed',
  null,
  'party.runtime.complete-b.1602',
  '95000000-0000-4000-8000-000000001609',
  (select (result ->> 'aggregateVersion')::bigint from runtime_results where label = 'completion_a'),
  pg_temp.runtime_audit(9)
);
reset role;

select is(
  (select result ->> 'resultCode' from runtime_results where label = 'completion_b'),
  'completed',
  'second participant completes quorum'
);
select is(
  (select result #>> '{session,state}' from runtime_results where label = 'completion_b'),
  'completed',
  'Session reaches completed terminal state'
);
select ok(
  (select nullif(result #>> '{session,completedAt}', '') is not null
   from runtime_results where label = 'completion_b'),
  'completed Session records authoritative completion time'
);
select is(
  public.test_count_party_outbox_events_v2(
    (select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'),
    'session.completed.v2'
  ),
  1,
  'completion quorum emits exactly one session.completed.v2 event'
);
select is(
  public.test_get_party_outbox_event_by_type_v2(
    (select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'),
    'session.completed.v2'
  ) #>> '{payload,verification}',
  'participant_quorum',
  'completion event carries participant-quorum verification'
);
select is(
  jsonb_array_length(
    public.test_get_party_outbox_event_by_type_v2(
      (select (result ->> 'aggregateId')::uuid
       from runtime_results where label = 'create'),
      'session.completed.v2'
    ) #> '{payload,participantPlayerIds}'
  ),
  2,
  'completion event retains both participants'
);

insert into runtime_events (label, payload)
select
  'completed',
  public.test_get_party_outbox_event_by_type_v2(
    (select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'),
    'session.completed.v2'
  );

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into runtime_results (label, result)
select 'trust', private.consume_session_completed_v2(
  (select payload from runtime_events where label = 'completed')
);
insert into runtime_results (label, result)
select 'trust_replay', private.consume_session_completed_v2(
  (select payload from runtime_events where label = 'completed')
);
insert into runtime_results (label, result)
select 'conversation_completed', public.consume_session_conversation_event_v2(
  (select payload from runtime_events where label = 'completed')
);
reset role;

select is(
  (select (result ->> 'repeated')::boolean from runtime_results where label = 'trust'),
  false,
  'Trust consumes the completed Session once'
);
select is(
  (select count(*)::integer
   from public.session_outcomes_v2 outcomes
   where outcomes.session_id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   )),
  1,
  'one authoritative Trust outcome is created'
);
select is(
  (select count(*)::integer
   from public.activity_items_v2 items
   where items.kind = 'feedback_prompt'
     and (items.payload ->> 'sessionId')::uuid = (
       select (result ->> 'aggregateId')::uuid
       from runtime_results where label = 'create'
     )),
  2,
  'both participants receive one feedback activity item'
);
select is(
  (select (result ->> 'repeated')::boolean from runtime_results where label = 'trust_replay'),
  true,
  'Trust event replay is idempotent'
);
select is(
  (select count(*)::integer
   from public.session_outcomes_v2 outcomes
   where outcomes.session_id = (
     select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'
   )),
  1,
  'Trust replay cannot create another outcome'
);
select is(
  (select result ->> 'conversationId' from runtime_results where label = 'conversation_completed'),
  (select result ->> 'conversationId' from runtime_results where label = 'conversation_join'),
  'completion activity stays on the canonical Session conversation'
);
select ok(
  (select result -> 'systemMessage' is not null
   from runtime_results where label = 'conversation_completed'),
  'Conversation projects completed Session system activity'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001601', true);
insert into runtime_results (label, result)
select 'read_a', public.get_play_session_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create')
);
reset role;

select is(
  (select result ->> 'state' from runtime_results where label = 'read_a'),
  'completed',
  'actor A reads completed Session after full journey'
);
select is(
  (select result #>> '{communication,status}' from runtime_results where label = 'read_a'),
  'ready',
  'actor A still sees ready communication projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000001602', true);
insert into runtime_results (label, result)
select 'read_b', public.get_play_session_v2(
  (select (result ->> 'aggregateId')::uuid from runtime_results where label = 'create')
);
reset role;

select is(
  (select result ->> 'state' from runtime_results where label = 'read_b'),
  'completed',
  'actor B independently reads completed Session'
);
select is(
  (select result #>> '{communication,conversationId}' from runtime_results where label = 'read_b'),
  (select result ->> 'conversationId' from runtime_results where label = 'conversation_join'),
  'actor B reads the same canonical ConversationId'
);
select is(
  (select count(*)::integer
   from private.core_v2_command_audit audits
   where audits.actor_player_id in (
     '21000000-0000-4000-8000-000000001601',
     '21000000-0000-4000-8000-000000001602'
   )),
  8,
  'successful lifecycle commands retain eight durable audit records'
);
select is(
  public.test_count_party_outbox_events_v2(
    (select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create'),
    null
  ),
  12,
  'full lifecycle emits the expected twelve Session events'
);
select is(
  public.test_count_party_conversation_events_v2(
    (select (result ->> 'aggregateId')::uuid
     from runtime_results where label = 'create')
  ),
  2,
  'Conversation consumes member-joined and completed events exactly once'
);

select * from finish();
rollback;
