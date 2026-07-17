create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

select has_function(
  'public',
  'get_match_set_dashboard_v2',
  array[]::text[],
  'Match Set dashboard authority read exists'
);
select has_function(
  'public',
  'list_visible_player_identities_v2',
  array['uuid[]'],
  'privacy-aware identity resolver exists'
);
select function_privs_are(
  'public', 'get_match_set_dashboard_v2', array[]::text[],
  'authenticated', array['EXECUTE'],
  'authenticated clients may read their Set dashboard'
);
select function_privs_are(
  'public', 'get_match_set_dashboard_v2', array[]::text[],
  'anon', array[]::text[],
  'anonymous callers cannot read Set dashboards'
);
select function_privs_are(
  'public', 'list_visible_player_identities_v2', array['uuid[]'],
  'authenticated', array['EXECUTE'],
  'authenticated clients may resolve visible identities'
);
select function_privs_are(
  'public', 'list_visible_player_identities_v2', array['uuid[]'],
  'anon', array[]::text[],
  'anonymous callers cannot resolve identities'
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
  ('17000000-0000-4000-8000-000000001711', 'authenticated', 'authenticated', 'dashboard-a@example.test', 'x', now(), now(), now()),
  ('17000000-0000-4000-8000-000000001712', 'authenticated', 'authenticated', 'dashboard-b@example.test', 'x', now(), now(), now()),
  ('17000000-0000-4000-8000-000000001713', 'authenticated', 'authenticated', 'dashboard-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('17000000-0000-4000-8000-000000001711', 'Dashboard A'),
  ('17000000-0000-4000-8000-000000001712', 'Dashboard B'),
  ('17000000-0000-4000-8000-000000001713', 'Dashboard C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('27000000-0000-4000-8000-000000001711', '17000000-0000-4000-8000-000000001711', '17000000-0000-4000-8000-000000001711', 'active', 1, true, true),
  ('27000000-0000-4000-8000-000000001712', '17000000-0000-4000-8000-000000001712', '17000000-0000-4000-8000-000000001712', 'active', 1, true, true),
  ('27000000-0000-4000-8000-000000001713', '17000000-0000-4000-8000-000000001713', '17000000-0000-4000-8000-000000001713', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('37000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001711', '17000000-0000-4000-8000-000000001711', 1, now()),
  ('37000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001712', '17000000-0000-4000-8000-000000001712', 1, now()),
  ('37000000-0000-4000-8000-000000001713', '27000000-0000-4000-8000-000000001713', '17000000-0000-4000-8000-000000001713', 1, now());

update public.player_privacy_settings_v2
set profile_visibility = 'private', version = version + 1
where player_id = '27000000-0000-4000-8000-000000001713';

insert into public.match_sets_v2 (
  id, owner_player_id, title, intent_kind, capacity, state, version,
  expires_at, created_at, updated_at
) values
  ('47000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001711', 'Actor owned set', 'ranked', 5, 'open', 3, now() + interval '2 hours', now() - interval '2 minutes', now()),
  ('47000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001712', 'Shared set', 'normal', 3, 'open', 2, now() + interval '1 hour', now() - interval '3 minutes', now() - interval '1 minute');

insert into public.match_set_members_v2 (set_id, player_id, role)
values
  ('47000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001711', 'owner'),
  ('47000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001712', 'member'),
  ('47000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001712', 'owner'),
  ('47000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001711', 'member');

insert into public.match_set_invites_v2 (
  id, set_id, inviter_player_id, target_player_id, state, version, expires_at
) values
  ('57000000-0000-4000-8000-000000001711', '47000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001711', 'pending', 1, now() + interval '30 minutes'),
  ('57000000-0000-4000-8000-000000001712', '47000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001713', 'pending', 1, now() + interval '30 minutes');

insert into public.match_set_join_requests_v2 (
  id, set_id, requester_player_id, state, version, expires_at
) values
  ('67000000-0000-4000-8000-000000001711', '47000000-0000-4000-8000-000000001712', '27000000-0000-4000-8000-000000001711', 'pending', 1, now() + interval '30 minutes'),
  ('67000000-0000-4000-8000-000000001712', '47000000-0000-4000-8000-000000001711', '27000000-0000-4000-8000-000000001713', 'pending', 1, now() + interval '30 minutes');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000001711', true);

create temporary table dashboard_result as
select public.get_match_set_dashboard_v2() as value;
create temporary table identity_result as
select public.list_visible_player_identities_v2(array[
  '27000000-0000-4000-8000-000000001711'::uuid,
  '27000000-0000-4000-8000-000000001712'::uuid,
  '27000000-0000-4000-8000-000000001713'::uuid
]) as value;

select is((select jsonb_array_length(value -> 'sets') from dashboard_result), 2, 'dashboard contains every active Set membership');
select ok((select value -> 'sets' @> '[{"setId":"47000000-0000-4000-8000-000000001711"}]'::jsonb from dashboard_result), 'dashboard contains the actor-owned Set');
select is((select jsonb_array_length(item -> 'members') from dashboard_result, lateral jsonb_array_elements(value -> 'sets') item where item ->> 'setId' = '47000000-0000-4000-8000-000000001711'), 2, 'Set snapshot contains ordered membership facts');
select ok((select item ? 'expiresAt' from dashboard_result, lateral jsonb_array_elements(value -> 'sets') item where item ->> 'setId' = '47000000-0000-4000-8000-000000001711'), 'Set snapshot exposes expiry authority');
select is((select value #>> '{incomingInvites,0,inviteId}' from dashboard_result), '57000000-0000-4000-8000-000000001711', 'incoming invite inbox is projected');
select is((select value #>> '{outgoingInvites,0,inviteId}' from dashboard_result), '57000000-0000-4000-8000-000000001712', 'owner outgoing invites are projected');
select is((select value #>> '{outgoingJoinRequests,0,joinRequestId}' from dashboard_result), '67000000-0000-4000-8000-000000001711', 'actor outgoing join requests are projected');
select is((select value #>> '{incomingJoinRequests,0,joinRequestId}' from dashboard_result), '67000000-0000-4000-8000-000000001712', 'owner moderation inbox is projected');
select is((select jsonb_array_length(value) from identity_result), 2, 'identity resolver excludes a private unrelated player');
select is((select value #>> '{0,playerId}' from identity_result), '27000000-0000-4000-8000-000000001711', 'identity resolver preserves requested self order');
select is((select value #>> '{1,playerId}' from identity_result), '27000000-0000-4000-8000-000000001712', 'shared Set membership grants identity presentation');
select throws_like(
  $$select public.list_visible_player_identities_v2(
    array_fill('27000000-0000-4000-8000-000000001711'::uuid, array[51])
  )$$,
  '%At most 50 player identities%',
  'identity resolver rejects oversized batches'
);

select * from finish();
rollback;
