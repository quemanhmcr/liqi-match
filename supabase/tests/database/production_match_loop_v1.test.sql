create extension if not exists pgtap with schema extensions;

begin;
select plan(28);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000911', 'authenticated', 'authenticated', 'loop-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000912', 'authenticated', 'authenticated', 'loop-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000000911', 'Loop A'),
  ('01000000-0000-4000-8000-000000000912', 'Loop B');

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
) values
  (
    '20000000-0000-4000-8000-000000000911',
    '01000000-0000-4000-8000-000000000911',
    '01000000-0000-4000-8000-000000000911',
    'active', 1, true, true
  ),
  (
    '20000000-0000-4000-8000-000000000912',
    '01000000-0000-4000-8000-000000000912',
    '01000000-0000-4000-8000-000000000912',
    'active', 1, true, true
  );

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  (
    '30000000-0000-4000-8000-000000000911',
    '20000000-0000-4000-8000-000000000911',
    '01000000-0000-4000-8000-000000000911',
    2,
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000912',
    '20000000-0000-4000-8000-000000000912',
    '01000000-0000-4000-8000-000000000912',
    3,
    now()
  );

update private.match_authority_config_v1
set reads_enabled = true,
    intent_writes_enabled = true,
    decision_writes_enabled = true;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000911',
  true
);
create temporary table loop_intent_a as
select public.activate_match_intent_v1(
  '{"intentKind":"rank","mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["jungle"],"timezone":"Asia/Bangkok"}'::jsonb,
  'loop-intent-a-000000000911',
  null
) as receipt;

select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000912',
  true
);
create temporary table loop_intent_b as
select public.activate_match_intent_v1(
  '{"intentKind":"rank","mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["support"],"timezone":"Asia/Bangkok"}'::jsonb,
  'loop-intent-b-000000000912',
  null
) as receipt;

select is(
  (select receipt ->> 'state' from loop_intent_a),
  'active',
  'walking skeleton activates player A Match Intent'
);
select is(
  (select receipt ->> 'state' from loop_intent_b),
  'active',
  'walking skeleton activates player B Match Intent'
);

select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000911',
  true
);
create temporary table loop_discovery_a as
select public.list_discovery_candidates_v1(null, 20) as response;

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      (select response -> 'items' from loop_discovery_a)
    ) candidate
    where candidate ->> 'playerId' =
      '20000000-0000-4000-8000-000000000912'
  ),
  'player A discovers player B from the authoritative API'
);
select is(
  (
    select (candidate #>> '{capabilities,canLike}')::boolean
    from jsonb_array_elements(
      (select response -> 'items' from loop_discovery_a)
    ) candidate
    where candidate ->> 'playerId' =
      '20000000-0000-4000-8000-000000000912'
  ),
  true,
  'discovered player B exposes authoritative canLike capability'
);
select is(
  (
    select (candidate #>> '{profileSummary,profileVersion}')::integer
    from jsonb_array_elements(
      (select response -> 'items' from loop_discovery_a)
    ) candidate
    where candidate ->> 'playerId' =
      '20000000-0000-4000-8000-000000000912'
  ),
  3,
  'candidate snapshot carries the target authoritative profile version'
);

create temporary table loop_like_a as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000912',
  'like',
  'loop-like-a-000000000911',
  '70000000-0000-4000-8000-000000000911',
  1,
  3
) as receipt;

select is(
  (select receipt ->> 'relationshipState' from loop_like_a),
  'liked',
  'first like persists unilateral relationship state'
);
select is(
  (select count(*)::integer from public.matches where player_low_id is not null),
  0,
  'first unilateral like does not create a Match'
);

select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000912',
  true
);
create temporary table loop_discovery_b as
select public.list_discovery_candidates_v1(null, 20) as response;

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      (select response -> 'items' from loop_discovery_b)
    ) candidate
    where candidate ->> 'playerId' =
      '20000000-0000-4000-8000-000000000911'
  ),
  'player B independently discovers player A'
);

create temporary table loop_like_b as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000911',
  'like',
  'loop-like-b-000000000912',
  '70000000-0000-4000-8000-000000000912',
  1,
  2
) as receipt;

select is(
  (select receipt ->> 'relationshipState' from loop_like_b),
  'matched',
  'reciprocal like returns matched relationship state'
);
select ok(
  (select receipt -> 'match' from loop_like_b) is not null,
  'reciprocal like returns the canonical Match receipt'
);

select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000911',
  true
);
create temporary table loop_like_a_retry as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000912',
  'like',
  'loop-like-a-000000000911',
  '70000000-0000-4000-8000-000000000911',
  1,
  3
) as receipt;

select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000912',
  true
);
create temporary table loop_like_b_retry as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000911',
  'like',
  'loop-like-b-000000000912',
  '70000000-0000-4000-8000-000000000912',
  1,
  2
) as receipt;

reset role;

select is(
  (select (receipt ->> 'repeated')::boolean from loop_like_a_retry),
  true,
  'player A retry returns its committed unilateral receipt'
);
select is(
  (select receipt ->> 'relationshipState' from loop_like_a_retry),
  'liked',
  'player A retry preserves the original semantic result'
);
select is(
  (select (receipt ->> 'repeated')::boolean from loop_like_b_retry),
  true,
  'player B reciprocal retry returns the committed Match receipt'
);
select is(
  (select receipt #>> '{match,matchId}' from loop_like_b_retry),
  (select receipt #>> '{match,matchId}' from loop_like_b),
  'reciprocal retry returns the same canonical MatchId'
);
select is(
  (select count(*)::integer from public.matches where player_low_id is not null),
  1,
  'walking skeleton creates exactly one canonical Match'
);
select is(
  (select count(*)::integer from public.relationship_decisions_v1),
  2,
  'walking skeleton persists one directional relationship per participant'
);
select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'match.created.v1'
  ),
  1,
  'walking skeleton emits exactly one match.created event'
);
select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'conversation.bootstrap_requested.v1'
  ),
  1,
  'walking skeleton emits exactly one conversation bootstrap request'
);
select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'notification.requested.v1'
  ),
  2,
  'walking skeleton emits one Match notification request per participant'
);
select is(
  (select count(*)::integer from public.conversations),
  0,
  'Mission 2 does not create a conversation directly'
);
select is(
  (
    select count(*)::integer
    from public.match_intents_v1
    where state = 'fulfilled'
  ),
  2,
  'both Match Intents are fulfilled atomically by the Match'
);
select is(
  (
    select home_status_v1::text
    from public.matches
    where player_low_id is not null
  ),
  'conversation_pending',
  'Home status remains conversation_pending until Mission 3 succeeds'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000912',
  true
);
create temporary table loop_home_b as
select public.list_home_match_facts_v1() as response;

select is(
  (select jsonb_array_length(response -> 'items') from loop_home_b),
  1,
  'Home returns exactly one authoritative Match fact'
);
select is(
  (select (response #>> '{items,0,canMessage}')::boolean from loop_home_b),
  false,
  'Home cannot message before the conversation-ready projection'
);

reset role;
select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type in (
      'player.liked.v1',
      'match.created.v1',
      'conversation.bootstrap_requested.v1',
      'notification.requested.v1'
    )
      and contract_version <> 1
  ),
  0,
  'all walking-skeleton domain events use Core V1 contract version'
);
select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type in (
      'player.liked.v1',
      'match.created.v1',
      'conversation.bootstrap_requested.v1',
      'notification.requested.v1'
    )
  ),
  6,
  'retries do not emit duplicate walking-skeleton events'
);
select is(
  (
    select count(*)::integer
    from private.command_receipts_v1
    where command_name in (
      'activate_match_intent_v1',
      'record_player_decision_v1'
    )
  ),
  4,
  'walking skeleton stores one durable command receipt per semantic command'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000912',
  true
);
select throws_like(
  $$select public.list_discovery_candidates_v1(null, 20)$$,
  '%intent_not_active%',
  'fulfilled Match Intent cannot start a new discovery snapshot'
);

reset role;
select * from finish();
rollback;
