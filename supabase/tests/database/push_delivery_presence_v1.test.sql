create extension if not exists pgtap with schema extensions;

begin;
select plan(22);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000811', 'authenticated', 'authenticated', 'push-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000812', 'authenticated', 'authenticated', 'push-b@example.test', 'x', now(), now(), now());
insert into public.profiles (id, display_name) values
  ('11000000-0000-4000-8000-000000000811', 'Push A'),
  ('11000000-0000-4000-8000-000000000812', 'Push B');
insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000000811', '01000000-0000-4000-8000-000000000811', '01000000-0000-4000-8000-000000000811', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000000812', '01000000-0000-4000-8000-000000000812', '01000000-0000-4000-8000-000000000812', 'active', 1, true, true);
insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000000811', '21000000-0000-4000-8000-000000000811', '11000000-0000-4000-8000-000000000811', 1, now()),
  ('31000000-0000-4000-8000-000000000812', '21000000-0000-4000-8000-000000000812', '11000000-0000-4000-8000-000000000812', 1, now());

update private.return_loop_config_v1
set push_enabled = true,
    push_rollout_percent = 100;

insert into public.matches (
  id, profile_low_id, profile_high_id, player_low_id, player_high_id,
  source_v1, correlation_id_v1, home_kind_v1, home_status_v1
) values (
  '51000000-0000-4000-8000-000000000811',
  '11000000-0000-4000-8000-000000000811',
  '11000000-0000-4000-8000-000000000812',
  '21000000-0000-4000-8000-000000000811',
  '21000000-0000-4000-8000-000000000812',
  'mutual_like',
  '71000000-0000-4000-8000-000000000811',
  'normal',
  'conversation_ready'
);
insert into private.home_conversation_projection_v1 (
  player_id, conversation_id, match_id, participant_player_id
) values (
  '21000000-0000-4000-8000-000000000811',
  '61000000-0000-4000-8000-000000000811',
  '51000000-0000-4000-8000-000000000811',
  '21000000-0000-4000-8000-000000000812'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000811', true);
select ok((public.register_push_device_v1('push-device-a1', 'ExponentPushToken[push-a1]', 'android') ->> 'enabled')::boolean, 'first device registers');
select ok((public.register_push_device_v1('push-device-a2', 'ExponentPushToken[push-a2]', 'ios') ->> 'enabled')::boolean, 'second device registers');
select is(public.upsert_notification_presence_v1('push-device-a1', 'foreground', '61000000-0000-4000-8000-000000000811') ->> 'state', 'foreground', 'authorized conversation presence is recorded');
select throws_ok(
  $$select public.upsert_notification_presence_v1('push-device-a1', 'foreground', '61000000-0000-4000-8000-000000009999')$$,
  '42501',
  'Conversation presence is not authorized',
  'presence cannot suppress an unrelated conversation'
);
reset role;

insert into public.notifications_v1 (
  id, recipient_player_id, kind, source_event_id, occurred_at,
  deep_link, title, body
) values (
  '91000000-0000-4000-8000-000000000811', '21000000-0000-4000-8000-000000000811', 'message_received', '81000000-0000-4000-8000-000000000811', now(), '{"target":"conversation","conversationId":"61000000-0000-4000-8000-000000000811"}', 'Tin nhắn', 'Tin nhắn mới'
);
insert into private.notification_push_jobs_v1 (
  notification_id, recipient_player_id, foreground_policy
) values (
  '91000000-0000-4000-8000-000000000811',
  '21000000-0000-4000-8000-000000000811',
  'allow_push'
);

select is(jsonb_array_length(public.claim_notification_push_jobs_v1(10)), 0, 'same-conversation foreground presence suppresses push claim');
select is((select status::text from private.notification_push_jobs_v1 where notification_id = '91000000-0000-4000-8000-000000000811'), 'suppressed', 'foreground suppression is persisted');
select is((select count(*)::integer from public.notifications_v1 where id = '91000000-0000-4000-8000-000000000811'), 1, 'foreground suppression never removes persisted notification');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000811', true);
select is(public.upsert_notification_presence_v1('push-device-a1', 'background', null) ->> 'state', 'background', 'background transition clears active presence');
reset role;

insert into public.notifications_v1 (
  id, recipient_player_id, kind, source_event_id, occurred_at,
  deep_link, title, body
) values (
  '91000000-0000-4000-8000-000000000812', '21000000-0000-4000-8000-000000000811', 'message_received', '81000000-0000-4000-8000-000000000812', now(), '{"target":"conversation","conversationId":"61000000-0000-4000-8000-000000000811"}', 'Tin nhắn', 'Tin nhắn mới'
);
insert into private.notification_push_jobs_v1 (
  id, notification_id, recipient_player_id, foreground_policy
) values (
  'a1000000-0000-4000-8000-000000000812',
  '91000000-0000-4000-8000-000000000812',
  '21000000-0000-4000-8000-000000000811',
  'allow_push'
);
create temporary table claimed_push as
select public.claim_notification_push_jobs_v1(10) as jobs;
select is(jsonb_array_length((select jobs from claimed_push)), 1, 'background recipient push is claimable');
select is((select jobs #>> '{0,sourceEventId}' from claimed_push), '81000000-0000-4000-8000-000000000812', 'claim includes source EventId for signed navigation payload');
select is(jsonb_array_length((select jobs #> '{0,tokens}' from claimed_push)), 2, 'claim returns all enabled recipient devices');

select is(
  public.record_notification_push_tickets_v1(
    'a1000000-0000-4000-8000-000000000812',
    '[{"token":"ExponentPushToken[push-a1]","status":"ok","ticketId":"expo-ticket-a1","errorCode":null,"message":null},{"token":"ExponentPushToken[push-a2]","status":"error","ticketId":null,"errorCode":"DeviceNotRegistered","message":"invalid"}]'
  ) ->> 'acceptedCount',
  '1',
  'ticket recording counts accepted devices'
);
select is((select count(*)::integer from private.notification_push_deliveries_v1 where job_id = 'a1000000-0000-4000-8000-000000000812'), 2, 'ticket response is persisted per device');
select is((select count(*)::integer from private.push_devices_v1 where player_id = '21000000-0000-4000-8000-000000000811' and enabled), 1, 'DeviceNotRegistered ticket disables only the invalid device');
select is((select status::text from private.notification_push_jobs_v1 where id = 'a1000000-0000-4000-8000-000000000812'), 'delivered', 'provider-accepted job is observable');

update private.notification_push_deliveries_v1
set receipt_available_at = now() - interval '1 second'
where ticket_id = 'expo-ticket-a1';
create temporary table claimed_receipt as
select public.claim_notification_push_receipts_v1(10) as receipts;
select is(jsonb_array_length((select receipts from claimed_receipt)), 1, 'accepted ticket becomes receipt-claimable');
select ok((select receipt_claimed_at is not null from private.notification_push_deliveries_v1 where ticket_id = 'expo-ticket-a1'), 'receipt claim lease is persisted');
select is(
  public.record_notification_push_receipts_v1(
    jsonb_build_array(jsonb_build_object(
      'deliveryId', (select receipts #>> '{0,deliveryId}' from claimed_receipt),
      'ticketId', 'expo-ticket-a1',
      'status', 'error',
      'errorCode', 'DeviceNotRegistered',
      'message', 'unregistered'
    ))
  ) ->> 'errorCount',
  '1',
  'receipt errors are recorded'
);
select is((select status::text from private.notification_push_deliveries_v1 where ticket_id = 'expo-ticket-a1'), 'receipt_error', 'receipt status is durable');
select is((select count(*)::integer from private.push_devices_v1 where player_id = '21000000-0000-4000-8000-000000000811' and enabled), 0, 'DeviceNotRegistered receipt disables the remaining token');

update private.return_loop_config_v1 set push_enabled = false;
insert into private.notification_push_jobs_v1 (
  notification_id, recipient_player_id, foreground_policy
) values (
  '91000000-0000-4000-8000-000000000812',
  '21000000-0000-4000-8000-000000000811',
  'allow_push'
);
select is(jsonb_array_length(public.claim_notification_push_jobs_v1(10)), 0, 'push kill switch stops claims');
select is((select count(*)::integer from public.notifications_v1), 2, 'push rollback leaves notification history intact');

select * from finish();
rollback;
