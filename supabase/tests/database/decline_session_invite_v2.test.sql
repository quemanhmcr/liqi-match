create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

select has_function(
  'public',
  'decline_session_invite_v2',
  array['uuid', 'uuid', 'text', 'uuid', 'bigint', 'jsonb'],
  'Session invite decline command exists'
);
select function_privs_are(
  'public', 'decline_session_invite_v2',
  array['uuid', 'uuid', 'text', 'uuid', 'bigint', 'jsonb'],
  'authenticated', array['EXECUTE'],
  'authenticated clients may decline their Session invites'
);
select function_privs_are(
  'public', 'decline_session_invite_v2',
  array['uuid', 'uuid', 'text', 'uuid', 'bigint', 'jsonb'],
  'anon', array[]::text[],
  'anonymous callers cannot decline Session invites'
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
  ('17000000-0000-4000-8000-000000001721', 'authenticated', 'authenticated', 'decline-owner@example.test', 'x', now(), now(), now()),
  ('17000000-0000-4000-8000-000000001722', 'authenticated', 'authenticated', 'decline-target@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('17000000-0000-4000-8000-000000001721', 'Decline Owner'),
  ('17000000-0000-4000-8000-000000001722', 'Decline Target');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('27000000-0000-4000-8000-000000001721', '17000000-0000-4000-8000-000000001721', '17000000-0000-4000-8000-000000001721', 'active', 1, true, true),
  ('27000000-0000-4000-8000-000000001722', '17000000-0000-4000-8000-000000001722', '17000000-0000-4000-8000-000000001722', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('37000000-0000-4000-8000-000000001721', '27000000-0000-4000-8000-000000001721', '17000000-0000-4000-8000-000000001721', 1, now()),
  ('37000000-0000-4000-8000-000000001722', '27000000-0000-4000-8000-000000001722', '17000000-0000-4000-8000-000000001722', 1, now());

insert into public.play_sessions_v2 (
  id, owner_player_id, source_kind, title, capacity, state,
  version, membership_version, timezone, expires_at
) values (
  '47000000-0000-4000-8000-000000001721',
  '27000000-0000-4000-8000-000000001721',
  'manual', 'Decline invite session', 2, 'recruiting',
  1, 1, 'Asia/Bangkok', now() + interval '2 hours'
);

insert into public.play_session_members_v2 (session_id, player_id, role)
values (
  '47000000-0000-4000-8000-000000001721',
  '27000000-0000-4000-8000-000000001721',
  'owner'
);

insert into public.play_session_invites_v2 (
  id, session_id, inviter_player_id, target_player_id,
  state, version, expires_at
) values (
  '57000000-0000-4000-8000-000000001721',
  '47000000-0000-4000-8000-000000001721',
  '27000000-0000-4000-8000-000000001721',
  '27000000-0000-4000-8000-000000001722',
  'pending', 1, now() + interval '30 minutes'
);

create temporary table decline_results (
  label text primary key,
  value jsonb not null
);
grant all on decline_results to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000001722', true);

insert into decline_results (label, value)
select 'first', public.decline_session_invite_v2(
  '47000000-0000-4000-8000-000000001721',
  '57000000-0000-4000-8000-000000001721',
  'session.invite.decline.1721',
  '77000000-0000-4000-8000-000000001721',
  1,
  jsonb_build_object(
    'appVersion', 'decline-invite-pgtap',
    'clientCreatedAt', '2026-07-16T09:00:00.000Z',
    'clientRequestId', '87000000-0000-4000-8000-000000001721',
    'deviceInstallationId', '97000000-0000-4000-8000-000000001721',
    'platform', 'android'
  )
);

insert into decline_results (label, value)
select 'replay', public.decline_session_invite_v2(
  '47000000-0000-4000-8000-000000001721',
  '57000000-0000-4000-8000-000000001721',
  'session.invite.decline.1721',
  '77000000-0000-4000-8000-000000001721',
  1,
  jsonb_build_object(
    'appVersion', 'decline-invite-pgtap',
    'clientCreatedAt', '2026-07-16T09:00:00.000Z',
    'clientRequestId', '87000000-0000-4000-8000-000000001721',
    'deviceInstallationId', '97000000-0000-4000-8000-000000001721',
    'platform', 'android'
  )
);

select is((select value ->> 'resultCode' from decline_results where label = 'first'), 'invite_declined', 'command returns canonical result code');
select is((select (value ->> 'repeated')::boolean from decline_results where label = 'first'), false, 'first decline is not a replay');
reset role;
select is((select state::text from public.play_session_invites_v2 where id = '57000000-0000-4000-8000-000000001721'), 'declined', 'pending invite transitions to declined');
select is((select version::integer from public.play_session_invites_v2 where id = '57000000-0000-4000-8000-000000001721'), 2, 'invite version increments');
select ok((select responded_at is not null from public.play_session_invites_v2 where id = '57000000-0000-4000-8000-000000001721'), 'invite response timestamp is recorded');
select is((select version::integer from public.play_sessions_v2 where id = '47000000-0000-4000-8000-000000001721'), 2, 'Session aggregate version increments');
select is((select membership_version::integer from public.play_sessions_v2 where id = '47000000-0000-4000-8000-000000001721'), 1, 'decline does not mutate membership version');
select is((select count(*)::integer from private.outbox_events where aggregate_id = '47000000-0000-4000-8000-000000001721' and event_type = 'session.invite_declined.v2'), 1, 'decline emits one versioned event');
select is((select payload #>> '{payload,targetPlayerId}' from private.outbox_events where aggregate_id = '47000000-0000-4000-8000-000000001721' and event_type = 'session.invite_declined.v2'), '27000000-0000-4000-8000-000000001722', 'event payload identifies the target player');
select is((select (payload ->> 'aggregateVersion')::integer from private.outbox_events where aggregate_id = '47000000-0000-4000-8000-000000001721' and event_type = 'session.invite_declined.v2'), 2, 'event envelope carries the new Session version');
select is((select (value ->> 'repeated')::boolean from decline_results where label = 'replay'), true, 'same idempotency key replays the receipt');
select is((select count(*)::integer from private.outbox_events where aggregate_id = '47000000-0000-4000-8000-000000001721' and event_type = 'session.invite_declined.v2'), 1, 'receipt replay does not duplicate events');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000001722', true);
select throws_like(
  $$select public.decline_session_invite_v2(
    '47000000-0000-4000-8000-000000001721',
    '57000000-0000-4000-8000-000000001721',
    'session.invite.decline.stale.1721',
    '77000000-0000-4000-8000-000000001722',
    1,
    jsonb_build_object(
      'appVersion', 'decline-invite-pgtap',
      'clientCreatedAt', '2026-07-16T09:01:00.000Z',
      'clientRequestId', '87000000-0000-4000-8000-000000001722',
      'platform', 'android'
    )
  )$$,
  '%The Play Session version changed%',
  'new stale command is rejected by optimistic concurrency'
);
reset role;
select is((select count(*)::integer from private.command_receipts_v1 where command_name = 'decline_session_invite_v2' and account_id = '17000000-0000-4000-8000-000000001722'), 1, 'decline stores one completed command receipt');
select is((select count(*)::integer from private.core_v2_command_audit where command_name = 'decline_session_invite_v2' and account_id = '17000000-0000-4000-8000-000000001722'), 1, 'decline records one audit row');

select * from finish();
rollback;
