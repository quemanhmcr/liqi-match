create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000711', 'authenticated', 'authenticated', 'deep-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000712', 'authenticated', 'authenticated', 'deep-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000713', 'authenticated', 'authenticated', 'deep-suspended@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('11000000-0000-4000-8000-000000000711', 'Deep A'),
  ('11000000-0000-4000-8000-000000000712', 'Deep B'),
  ('11000000-0000-4000-8000-000000000713', 'Deep Suspended');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000000711', '01000000-0000-4000-8000-000000000711', '01000000-0000-4000-8000-000000000711', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000000712', '01000000-0000-4000-8000-000000000712', '01000000-0000-4000-8000-000000000712', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000000713', '01000000-0000-4000-8000-000000000713', '01000000-0000-4000-8000-000000000713', 'suspended', 2, false, false);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000000711', '21000000-0000-4000-8000-000000000711', '11000000-0000-4000-8000-000000000711', 1, now()),
  ('31000000-0000-4000-8000-000000000712', '21000000-0000-4000-8000-000000000712', '11000000-0000-4000-8000-000000000712', 1, now()),
  ('31000000-0000-4000-8000-000000000713', '21000000-0000-4000-8000-000000000713', '11000000-0000-4000-8000-000000000713', 1, now());

update private.return_loop_config_v1
set deep_links_enabled = true,
    deep_link_rollout_percent = 100;

insert into public.matches (
  id, profile_low_id, profile_high_id, player_low_id, player_high_id,
  source_v1, correlation_id_v1, home_kind_v1, home_status_v1
) values (
  '51000000-0000-4000-8000-000000000711',
  '11000000-0000-4000-8000-000000000711',
  '11000000-0000-4000-8000-000000000712',
  '21000000-0000-4000-8000-000000000711',
  '21000000-0000-4000-8000-000000000712',
  'mutual_like',
  '71000000-0000-4000-8000-000000000711',
  'rank',
  'conversation_pending'
);

insert into public.notifications_v1 (
  id, recipient_player_id, kind, source_event_id, occurred_at,
  deep_link, title, body
) values
  ('91000000-0000-4000-8000-000000000711', '21000000-0000-4000-8000-000000000711', 'match_created', '81000000-0000-4000-8000-000000000711', now(), '{"target":"match","matchId":"51000000-0000-4000-8000-000000000711"}', 'Match', 'Match mới'),
  ('91000000-0000-4000-8000-000000000712', '21000000-0000-4000-8000-000000000711', 'message_received', '81000000-0000-4000-8000-000000000712', now(), '{"target":"conversation","conversationId":"61000000-0000-4000-8000-000000000711"}', 'Tin nhắn', 'Tin nhắn mới'),
  ('91000000-0000-4000-8000-000000000713', '21000000-0000-4000-8000-000000000713', 'match_created', '81000000-0000-4000-8000-000000000713', now(), '{"target":"match","matchId":"51000000-0000-4000-8000-000000000711"}', 'Match', 'Match mới');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000711', true);

create temporary table available_resolution as
select public.resolve_notification_deep_link_v1(
  '91000000-0000-4000-8000-000000000711',
  '81000000-0000-4000-8000-000000000711'
) as value;

select is((select value ->> 'status' from available_resolution), 'available', 'owned current match resolves');
select is((select value #>> '{deepLink,target}' from available_resolution), 'match', 'resolver returns canonical persisted target');
select is((select value #>> '{deepLink,matchId}' from available_resolution), '51000000-0000-4000-8000-000000000711', 'resolver returns canonical persisted MatchId');
select ok((select value ->> 'readAt' is not null from available_resolution), 'tap atomically marks notification read');

select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000711',
    '81000000-0000-4000-8000-000000009999'
  ) ->> 'status',
  'not_found',
  'wrong source event cannot authorize the notification'
);
select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000713',
    '81000000-0000-4000-8000-000000000713'
  ) ->> 'status',
  'not_found',
  'another player notification is not disclosed'
);
select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000712',
    '81000000-0000-4000-8000-000000000712'
  ) ->> 'status',
  'defer_target',
  'conversation waits for the authoritative projection'
);

reset role;
insert into private.home_conversation_projection_v1 (
  player_id, conversation_id, match_id, participant_player_id
) values (
  '21000000-0000-4000-8000-000000000711',
  '61000000-0000-4000-8000-000000000711',
  '51000000-0000-4000-8000-000000000711',
  '21000000-0000-4000-8000-000000000712'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000711', true);
select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000712',
    '81000000-0000-4000-8000-000000000712'
  ) ->> 'status',
  'available',
  'conversation resolves after authoritative projection exists'
);

reset role;
update public.matches
set unmatched_at = now()
where id = '51000000-0000-4000-8000-000000000711';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000711', true);
select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000711',
    '81000000-0000-4000-8000-000000000711'
  ) ->> 'status',
  'expired',
  'closed match no longer resolves as available'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000713', true);
select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000713',
    '81000000-0000-4000-8000-000000000713'
  ) ->> 'status',
  'player_unavailable',
  'suspended player is not routed into a domain destination'
);

reset role;
update private.return_loop_config_v1
set deep_links_enabled = false;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000711', true);
select is(
  public.resolve_notification_deep_link_v1(
    '91000000-0000-4000-8000-000000000712',
    '81000000-0000-4000-8000-000000000712'
  ) ->> 'status',
  'disabled',
  'deep-link kill switch prevents routing'
);

reset role;
select is((select count(*)::integer from private.notification_deep_link_attempts_v1), 8, 'every authenticated resolution attempt is observable');
select is((select count(*)::integer from private.notification_deep_link_attempts_v1 where status = 'available'), 2, 'successful resolution count is observable');
select is((select count(*)::integer from private.notification_deep_link_attempts_v1 where status = 'not_found'), 2, 'authorization-safe misses are observable');
select is((select count(*)::integer from private.notification_deep_link_attempts_v1 where status = 'defer_target'), 1, 'event-ordering deferral is observable');
select is((select count(*)::integer from private.notification_deep_link_attempts_v1 where status in ('expired', 'player_unavailable', 'disabled')), 3, 'fallback and kill-switch outcomes are observable');

select * from finish();
rollback;
