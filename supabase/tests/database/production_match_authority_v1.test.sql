create extension if not exists pgtap with schema extensions;

begin;

select plan(35);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'authority-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'authority-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'authority-c@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated', 'authority-d@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000201', 'Authority A'),
  ('00000000-0000-0000-0000-000000000202', 'Authority B'),
  ('00000000-0000-0000-0000-000000000203', 'Authority C'),
  ('00000000-0000-0000-0000-000000000204', 'Authority D');

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000201', 'active', 2, true, true),
  ('20000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000202', 'active', 3, true, true),
  ('20000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000203', 'suspended', 5, false, false),
  ('20000000-0000-4000-8000-000000000204', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000204', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000201', 4, now()),
  ('30000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000202', 7, now()),
  ('30000000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000203', 1, now()),
  ('30000000-0000-4000-8000-000000000204', '20000000-0000-4000-8000-000000000204', '00000000-0000-0000-0000-000000000204', 2, now());

update private.match_authority_config_v1
set intent_writes_enabled = true,
    decision_writes_enabled = true,
    reads_enabled = true;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
create temporary table intent_a as
select public.activate_match_intent_v1(
  '{"mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["jungle"],"timezone":"Asia/Ho_Chi_Minh"}'::jsonb,
  'intent-authority-a-0001',
  null
) as receipt;
create temporary table intent_a_retry as
select public.activate_match_intent_v1(
  '{"mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["jungle"],"timezone":"Asia/Ho_Chi_Minh"}'::jsonb,
  'intent-authority-a-0001',
  null
) as receipt;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
create temporary table intent_b as
select public.activate_match_intent_v1(
  '{"intentKind":"rank","mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["support"],"timezone":"Asia/Ho_Chi_Minh"}'::jsonb,
  'intent-authority-b-0001',
  null
) as receipt;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000204', true);
create temporary table intent_d as
select public.activate_match_intent_v1(
  '{"intentKind":"normal","mode":"normal","partyFormat":"flex","sessionPlan":"long","roleSlugs":[],"timezone":"Asia/Ho_Chi_Minh"}'::jsonb,
  'intent-authority-d-0001',
  null
) as receipt;
create temporary table pause_d as
select public.pause_match_intent_v1('intent-pause-d-0001', 1) as receipt;
create temporary table pause_d_retry as
select public.pause_match_intent_v1('intent-pause-d-0001', 1) as receipt;

select is(
  (select count(*)::integer from public.match_intents_v1),
  3,
  'one current Match Intent aggregate exists per activated player'
);
select is((select receipt ->> 'state' from intent_a), 'active', 'A intent is active');
select is((select receipt ->> 'state' from intent_b), 'active', 'B intent is active');
select is((select (receipt ->> 'version')::integer from intent_a), 1, 'first activation starts at version one');
select is((select receipt #>> '{filters,intentKind}' from intent_a), 'rank', 'legacy ranked mode is canonicalized to authoritative rank intent kind');
select is((select (receipt ->> 'repeated')::boolean from intent_a_retry), true, 'activation retry returns the durable command receipt');
select is((select receipt ->> 'state' from pause_d), 'paused', 'pause command owns the active to paused transition');
select is((select (receipt ->> 'repeated')::boolean from pause_d_retry), true, 'pause retry returns the durable command receipt');
select is(
  public.get_current_match_intent_v1() ->> 'state',
  'paused',
  'current Match Intent query returns the persisted authoritative state'
);
select is(
  (select count(*)::integer from private.command_receipts_v1 where command_name = 'activate_match_intent_v1'),
  3,
  'Match Intent activation uses the shared command receipt authority'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
create temporary table decision_a_first as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000202',
  'like',
  'decision-authority-a-0001',
  '70000000-0000-4000-8000-000000000201',
  1,
  7
) as receipt;
create temporary table decision_a_retry as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000202',
  'like',
  'decision-authority-a-0001',
  '70000000-0000-4000-8000-000000000201',
  1,
  7
) as receipt;
create temporary table decision_a_semantic_duplicate as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000202',
  'like',
  'decision-authority-a-0002',
  '70000000-0000-4000-8000-000000000211',
  1,
  7
) as receipt;

select is((select receipt ->> 'relationshipState' from decision_a_first), 'liked', 'first unilateral like persists liked state');
select is((select (receipt ->> 'repeated')::boolean from decision_a_retry), true, 'same decision command retry returns its durable receipt');
select is((select (receipt ->> 'repeated')::boolean from decision_a_semantic_duplicate), true, 'a new command key cannot duplicate the same semantic like transition');
select is((select count(*)::integer from public.relationship_decisions_v1), 1, 'like retries keep one relationship decision');
select is((select count(*)::integer from private.outbox_events where event_type = 'player.liked.v1'), 1, 'semantic duplicate like does not emit a second liked event');
select is((select count(*)::integer from public.matches where player_low_id is not null), 0, 'unilateral like does not create a match');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
create temporary table decision_b_first as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000201',
  'like',
  'decision-authority-b-0001',
  '70000000-0000-4000-8000-000000000202',
  1,
  4
) as receipt;
create temporary table decision_b_retry as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000201',
  'like',
  'decision-authority-b-0001',
  '70000000-0000-4000-8000-000000000202',
  1,
  4
) as receipt;

select is((select receipt ->> 'relationshipState' from decision_b_first), 'matched', 'reciprocal like creates a match');
select is((select (receipt ->> 'repeated')::boolean from decision_b_retry), true, 'reciprocal retry returns the original match receipt');
select is((select count(*)::integer from public.matches where player_low_id is not null), 1, 'mutual likes create exactly one canonical match');
select is((select count(*)::integer from public.conversations), 0, 'Mission 2 never creates a conversation directly');
select is((select count(*)::integer from private.outbox_events where event_type = 'match.created.v1'), 1, 'match.created is emitted exactly once');
select is((select count(*)::integer from private.outbox_events where event_type = 'conversation.bootstrap_requested.v1'), 1, 'conversation bootstrap is requested exactly once');
select is((select count(*)::integer from private.outbox_events where event_type = 'notification.requested.v1'), 2, 'one match notification request is emitted per participant');
select is((select count(*)::integer from private.outbox_events where event_type = 'player.liked.v1'), 2, 'one liked event exists per distinct player transition');
select is((select home_kind_v1::text from public.matches where player_low_id is not null), 'rank', 'Home kind is persisted from both authoritative Match Intents');
select is((select home_status_v1::text from public.matches where player_low_id is not null), 'conversation_pending', 'Home status remains pending until the conversation consumer succeeds');
select is(
  (select jsonb_build_array(player_low_id, player_high_id) from public.matches where player_low_id is not null),
  '["20000000-0000-4000-8000-000000000201","20000000-0000-4000-8000-000000000202"]'::jsonb,
  'canonical match identity is the ordered PlayerId pair'
);
select is(
  (select jsonb_build_array(profile_low_id, profile_high_id) from public.matches where player_low_id is not null),
  '["00000000-0000-0000-0000-000000000201","00000000-0000-0000-0000-000000000202"]'::jsonb,
  'legacy profile IDs remain compatibility columns rather than semantic identity'
);
select is(
  (select state::text from public.match_intents_v1 where player_id = '20000000-0000-4000-8000-000000000201'),
  'fulfilled',
  'A intent is fulfilled atomically by the canonical match'
);
select is(
  (select state::text from public.match_intents_v1 where player_id = '20000000-0000-4000-8000-000000000202'),
  'fulfilled',
  'B intent is fulfilled atomically by the canonical match'
);
select is(
  (select payload ->> 'causationId' from private.outbox_events where event_type = 'conversation.bootstrap_requested.v1'),
  (select id::text from private.outbox_events where event_type = 'match.created.v1'),
  'conversation bootstrap is caused by match.created'
);
select throws_ok(
  $$select * from public.record_swipe('00000000-0000-0000-0000-000000000201', 'like')$$,
  '55000',
  'Legacy matching writes are disabled after v1 cutover',
  'legacy semantic writes are permanently disabled after v1 cutover'
);

reset role;
update public.players
set lifecycle_state = 'suspended',
    discoverable = false,
    messaging_allowed = false,
    lifecycle_version = lifecycle_version + 1
where id = '20000000-0000-4000-8000-000000000202';
update private.match_authority_config_v1
set intent_writes_enabled = false,
    decision_writes_enabled = false;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
create temporary table decision_b_retry_after_policy_change as
select public.record_player_decision_v1(
  '20000000-0000-4000-8000-000000000201',
  'like',
  'decision-authority-b-0001',
  '70000000-0000-4000-8000-000000000202',
  1,
  4
) as receipt;
select is(
  (select (receipt ->> 'repeated')::boolean from decision_b_retry_after_policy_change),
  true,
  'a committed receipt replays after suspension and kill-switch activation'
);

reset role;
update private.match_authority_config_v1
set intent_writes_enabled = true,
    decision_writes_enabled = true;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select throws_like(
  $$select public.record_player_decision_v1(
    '20000000-0000-4000-8000-000000000203',
    'like',
    'decision-suspended-c-0001',
    '70000000-0000-4000-8000-000000000203',
    1,
    1
  )$$,
  '%player_suspended%',
  'suspended target is rejected by command-time lifecycle authority'
);
select throws_like(
  $$select public.record_player_decision_v1(
    '20000000-0000-4000-8000-000000000203',
    'pass',
    'decision-authority-a-0001',
    '70000000-0000-4000-8000-000000000204',
    1,
    1
  )$$,
  '%idempotency_key_reused%',
  'one idempotency key cannot represent a different decision request'
);

reset role;
select * from finish();
rollback;
