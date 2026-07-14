create extension if not exists pgtap with schema extensions;

begin;

select plan(25);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'authority-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'authority-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'authority-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000201', 'Authority A'),
  ('00000000-0000-0000-0000-000000000202', 'Authority B'),
  ('00000000-0000-0000-0000-000000000203', 'Authority C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000201', 'active', 2, true, true),
  ('20000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000202', 'active', 3, true, true),
  ('20000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000203', 'suspended', 5, false, false);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('00000000-0000-0000-0000-000000000201', '20000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000201', 4, now()),
  ('00000000-0000-0000-0000-000000000202', '20000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000202', 7, now()),
  ('00000000-0000-0000-0000-000000000203', '20000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000203', 1, now());

update private.match_authority_config_v1
set intent_writes_enabled = true, decision_writes_enabled = true;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
create temporary table intent_a as
select public.activate_match_intent_v1(
  '{"mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["jungle"],"timezone":"Asia/Ho_Chi_Minh"}'::jsonb,
  'intent-authority-a-0001',
  null
) as receipt;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
create temporary table intent_b as
select public.activate_match_intent_v1(
  '{"mode":"ranked","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["support"],"timezone":"Asia/Ho_Chi_Minh"}'::jsonb,
  'intent-authority-b-0001',
  null
) as receipt;

reset role;

select is((select count(*)::integer from public.match_intents_v1), 2, 'one current intent aggregate exists per player');
select is((select receipt ->> 'state' from intent_a), 'active', 'A intent is active');
select is((select receipt ->> 'state' from intent_b), 'active', 'B intent is active');
select is((select (receipt ->> 'version')::integer from intent_a), 1, 'first activation starts at version one');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
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

reset role;

select is((select receipt ->> 'relationshipState' from decision_a_first), 'liked', 'first unilateral like is liked');
select is((select (receipt ->> 'repeated')::boolean from decision_a_retry), true, 'same idempotency key returns repeated receipt');
select is((select count(*)::integer from public.relationship_decisions_v1), 1, 'like retry keeps one relationship decision');
select is((select count(*)::integer from public.matches where player_low_id is not null), 0, 'unilateral like does not create a match');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
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

reset role;

select is((select receipt ->> 'relationshipState' from decision_b_first), 'matched', 'reciprocal like creates a match');
select is((select (receipt ->> 'repeated')::boolean from decision_b_retry), true, 'reciprocal retry returns repeated match receipt');
select is((select count(*)::integer from public.matches where player_low_id is not null), 1, 'mutual likes create exactly one canonical v1 match');
select is((select count(*)::integer from public.conversations), 0, 'Mission 2 does not create conversation directly');
select is((select count(*)::integer from private.outbox_events where event_type = 'match.created.v1'), 1, 'match.created event is emitted exactly once');
select is((select count(*)::integer from private.outbox_events where event_type = 'conversation.bootstrap_requested.v1'), 1, 'conversation bootstrap request is emitted exactly once');
select is((select count(*)::integer from private.outbox_events where event_type = 'notification.requested.v1'), 2, 'one match notification request is emitted per participant');
select is((select count(*)::integer from private.outbox_events where event_type = 'player.liked.v1'), 2, 'one liked event is emitted per semantic like transition');
select is((select home_kind_v1::text from public.matches where player_low_id is not null), 'rank', 'Home kind is persisted as an authoritative server fact');
select is((select home_status_v1::text from public.matches where player_low_id is not null), 'conversation_pending', 'Home status reflects pending conversation bootstrap');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select throws_ok(
  $$select * from public.record_swipe(
    '00000000-0000-0000-0000-000000000201',
    'like'
  )$$,
  '55000',
  'Legacy matching writes are disabled after v1 cutover',
  'legacy semantic engine cannot create matches after v1 cutover'
);

reset role;

select is(
  (select state::text from public.match_intents_v1 where player_id = '20000000-0000-4000-8000-000000000201'),
  'fulfilled',
  'A intent is fulfilled by the canonical match'
);
select is(
  (select state::text from public.match_intents_v1 where player_id = '20000000-0000-4000-8000-000000000202'),
  'fulfilled',
  'B intent is fulfilled by the canonical match'
);
select is(
  (
    select payload ->> 'causationId'
    from private.outbox_events
    where event_type = 'conversation.bootstrap_requested.v1'
  ),
  (
    select id::text
    from private.outbox_events
    where event_type = 'match.created.v1'
  ),
  'conversation bootstrap is caused by match.created rather than player.liked'
);

update public.players
set lifecycle_state = 'suspended',
    lifecycle_version = lifecycle_version + 1,
    discoverable = false,
    messaging_allowed = false
where account_id = '00000000-0000-0000-0000-000000000202';
update private.match_authority_config_v1
set intent_writes_enabled = false, decision_writes_enabled = false;

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

reset role;
select is(
  (select (receipt ->> 'repeated')::boolean from decision_b_retry_after_policy_change),
  true,
  'committed idempotent receipt replays after suspension and kill switch'
);

update private.match_authority_config_v1
set intent_writes_enabled = true, decision_writes_enabled = true;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select throws_ok(
  $$select public.record_player_decision_v1(
    '20000000-0000-4000-8000-000000000203',
    'like',
    'decision-suspended-c-0001',
    '70000000-0000-4000-8000-000000000203',
    1,
    1
  )$$,
  '42501',
  'Player lifecycle must be active',
  'suspended target is rejected at command execution time'
);

select throws_ok(
  $$select public.record_player_decision_v1(
    '20000000-0000-4000-8000-000000000203',
    'pass',
    'decision-authority-a-0001',
    '70000000-0000-4000-8000-000000000204',
    1,
    1
  )$$,
  '23505',
  'Idempotency key was reused with a different request',
  'same idempotency key with a different fingerprint is rejected before execution'
);

reset role;

select * from finish();
rollback;
