create extension if not exists pgtap with schema extensions;

begin;

select plan(50);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated', 'return-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000402', 'authenticated', 'authenticated', 'return-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000403', 'authenticated', 'authenticated', 'return-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000401', 'Return A'),
  ('00000000-0000-0000-0000-000000000402', 'Return B'),
  ('00000000-0000-0000-0000-000000000403', 'Return C');


insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000401', 'active', 2, true, true),
  ('20000000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000402', 'active', 3, true, true),
  ('20000000-0000-4000-8000-000000000403', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000403', 'suspended', 5, false, false);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000401', 3, now()),
  ('30000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000402', 4, now()),
  ('30000000-0000-4000-8000-000000000403', '20000000-0000-4000-8000-000000000403', '00000000-0000-0000-0000-000000000403', 1, now());

update private.return_loop_config_v1
set event_consumer_enabled = true,
    home_reads_enabled = true,
    notification_inbox_enabled = true,
    push_enabled = true,
    deep_links_enabled = true,
    home_rollout_percent = 100,
    inbox_rollout_percent = 100,
    push_rollout_percent = 100,
    deep_link_rollout_percent = 100;

insert into public.matches (
  id, profile_low_id, profile_high_id, player_low_id, player_high_id,
  source_v1, correlation_id_v1, home_kind_v1, home_status_v1
) values (
  '50000000-0000-4000-8000-000000000401',
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
  '20000000-0000-4000-8000-000000000401',
  '20000000-0000-4000-8000-000000000402',
  'mutual_like',
  '70000000-0000-4000-8000-000000000401',
  'rank',
  'conversation_pending'
);

insert into public.conversations (id, match_id, bootstrap_event_id_v1)
values (
  '60000000-0000-4000-8000-000000000401',
  '50000000-0000-4000-8000-000000000401',
  '80000000-0000-4000-8000-000000000400'
);

create temporary table return_loop_events (name text primary key, payload jsonb not null);
insert into return_loop_events (name, payload) values
('match_notification', '{
  "eventId":"80000000-0000-4000-8000-000000000401",
  "eventType":"notification.requested.v1",
  "aggregateType":"player",
  "aggregateId":"20000000-0000-4000-8000-000000000402",
  "occurredAt":"2026-07-14T08:00:00.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000401",
  "causationId":"80000000-0000-4000-8000-000000000400",
  "data":{"recipientPlayerId":"20000000-0000-4000-8000-000000000402","reasonCode":"match_created","target":{"kind":"match","matchId":"50000000-0000-4000-8000-000000000401"}}
}'::jsonb),
('conversation_created', '{
  "eventId":"80000000-0000-4000-8000-000000000402",
  "eventType":"conversation.created.v1",
  "aggregateType":"conversation",
  "aggregateId":"60000000-0000-4000-8000-000000000401",
  "occurredAt":"2026-07-14T08:01:00.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000401",
  "causationId":"80000000-0000-4000-8000-000000000400",
  "data":{"conversation":{"conversationId":"60000000-0000-4000-8000-000000000401","matchId":"50000000-0000-4000-8000-000000000401","participantIds":["20000000-0000-4000-8000-000000000401","20000000-0000-4000-8000-000000000402"],"state":"open","lastMessage":null,"unreadCount":0,"version":1},"bootstrapEventId":"80000000-0000-4000-8000-000000000400"}
}'::jsonb),
('message_sent', '{
  "eventId":"80000000-0000-4000-8000-000000000410",
  "eventType":"message.sent.v1",
  "aggregateType":"conversation",
  "aggregateId":"60000000-0000-4000-8000-000000000401",
  "occurredAt":"2026-07-14T08:02:30.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000401",
  "causationId":"80000000-0000-4000-8000-000000000402",
  "data":{"message":{"messageId":"91000000-0000-4000-8000-000000000401","conversationId":"60000000-0000-4000-8000-000000000401","senderPlayerId":"20000000-0000-4000-8000-000000000401","clientMessageId":"return-loop-message-0001","sequence":1,"content":{"kind":"text","text":"Chào bạn, mình duo rank nhé?"},"createdAt":"2026-07-14T08:02:30.000Z"},"recipientPlayerIds":["20000000-0000-4000-8000-000000000402"]}
}'::jsonb),
('message_notification', '{
  "eventId":"80000000-0000-4000-8000-000000000403",
  "eventType":"notification.requested.v1",
  "aggregateType":"player",
  "aggregateId":"20000000-0000-4000-8000-000000000402",
  "occurredAt":"2026-07-14T08:03:00.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000401",
  "causationId":"80000000-0000-4000-8000-000000000404",
  "data":{"recipientPlayerId":"20000000-0000-4000-8000-000000000402","reasonCode":"message_received","target":{"kind":"conversation","conversationId":"60000000-0000-4000-8000-000000000401","messageId":"91000000-0000-4000-8000-000000000401","senderPlayerId":"20000000-0000-4000-8000-000000000401","authoritativeUnreadCount":3}}
}'::jsonb),
('read_advanced', '{
  "eventId":"80000000-0000-4000-8000-000000000405",
  "eventType":"conversation.read_advanced.v1",
  "aggregateType":"conversation",
  "aggregateId":"60000000-0000-4000-8000-000000000401",
  "occurredAt":"2026-07-14T08:04:00.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000401",
  "causationId":"80000000-0000-4000-8000-000000000403",
  "data":{"readState":{"conversationId":"60000000-0000-4000-8000-000000000401","playerId":"20000000-0000-4000-8000-000000000402","lastReadSequence":1,"unreadCount":0,"updatedAt":"2026-07-14T08:04:00.000Z"}}
}'::jsonb),
('profile_updated', '{
  "eventId":"80000000-0000-4000-8000-000000000411",
  "eventType":"player.profile_updated.v1",
  "aggregateType":"player",
  "aggregateId":"20000000-0000-4000-8000-000000000401",
  "occurredAt":"2026-07-14T08:04:30.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000411",
  "causationId":null,
  "data":{"accountId":"00000000-0000-0000-0000-000000000401","playerId":"20000000-0000-4000-8000-000000000401","profileId":"30000000-0000-4000-8000-000000000401","lifecycleVersion":2,"profileVersion":3}
}'::jsonb),
('delayed_message_notification', '{
  "eventId":"80000000-0000-4000-8000-000000000406",
  "eventType":"notification.requested.v1",
  "aggregateType":"player",
  "aggregateId":"20000000-0000-4000-8000-000000000402",
  "occurredAt":"2026-07-14T08:02:00.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000401",
  "causationId":"80000000-0000-4000-8000-000000000407",
  "data":{"recipientPlayerId":"20000000-0000-4000-8000-000000000402","reasonCode":"message_received","target":{"kind":"conversation","conversationId":"60000000-0000-4000-8000-000000000401","messageId":"91000000-0000-4000-8000-000000000402","senderPlayerId":"20000000-0000-4000-8000-000000000401","authoritativeUnreadCount":2}}
}'::jsonb),
('suspended_notification', '{
  "eventId":"80000000-0000-4000-8000-000000000408",
  "eventType":"notification.requested.v1",
  "aggregateType":"player",
  "aggregateId":"20000000-0000-4000-8000-000000000403",
  "occurredAt":"2026-07-14T08:05:00.000Z",
  "correlationId":"70000000-0000-4000-8000-000000000403",
  "causationId":null,
  "data":{"recipientPlayerId":"20000000-0000-4000-8000-000000000403","reasonCode":"match_created","target":{"kind":"match","matchId":"50000000-0000-4000-8000-000000000401"}}
}'::jsonb);

select is(
  (public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'match_notification')) ->> 'processed')::boolean,
  true,
  'match notification event is processed'
);
select is(
  (public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'match_notification')) ->> 'repeated')::boolean,
  true,
  'same event is an idempotent replay'
);
select is((select count(*)::integer from public.notifications_v1), 1, 'one source event creates one notification');
select is((select count(distinct source_event_id)::integer from public.notifications_v1), 1, 'source event uniqueness is preserved');
select is((select status::text from private.notification_push_jobs_v1 limit 1), 'pending', 'notification persists before pending push delivery');
select is((select count(*)::integer from private.notification_delivery_errors_v1), 0, 'push enqueue does not hide an authority error');
select set_config(
  'test.match_notification_id',
  (select id::text from public.notifications_v1 where source_event_id = '80000000-0000-4000-8000-000000000401'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);

select is((public.list_notifications_v1(null, 30) ->> 'unseenCount')::integer, 1, 'inbox starts unseen');
select is((public.mark_notifications_seen_through_v1(current_setting('test.match_notification_id')::uuid) ->> 'unseenCount')::integer, 0, 'seen watermark clears unseen count');
select ok((public.list_notifications_v1(null, 30) #>> '{items,0,seenAt}') is not null, 'seen transition is persisted');
select ok((public.mark_notification_read_v1(current_setting('test.match_notification_id')::uuid) #>> '{notification,readAt}') is not null, 'read transition is persisted');
select ok(
  (public.list_notifications_v1(null, 30) #>> '{items,0,readAt}')::timestamptz >=
  (public.list_notifications_v1(null, 30) #>> '{items,0,seenAt}')::timestamptz,
  'read transition implies seen monotonically'
);
select is(
  public.mark_notification_read_v1(current_setting('test.match_notification_id')::uuid) #>> '{notification,readAt}',
  public.list_notifications_v1(null, 30) #>> '{items,0,readAt}',
  'repeated mark-read preserves the first timestamp'
);
select ok(
  (public.register_push_device_v1(
    'installation-return-loop-00000001',
    'ExpoPushToken[return_loop_device_001]',
    'android'
  ) ->> 'enabled')::boolean,
  'active account owns its registered push device'
);
reset role;

select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'conversation_created')) ->> 'processed')::boolean, 'conversation event is processed');
select is((select home_status_v1::text from public.matches where id = '50000000-0000-4000-8000-000000000401'), 'conversation_ready', 'conversation event advances server Home status');
select is((select count(*)::integer from private.home_conversation_projection_v1), 2, 'conversation event projects both participants');
select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'message_sent')) ->> 'processed')::boolean, 'message event is processed');
select is((select last_message_preview from private.home_conversation_projection_v1 where player_id = '20000000-0000-4000-8000-000000000402'), 'Chào bạn, mình duo rank nhé?', 'Home preview comes from canonical MessageV1 content');
select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'message_notification')) ->> 'processed')::boolean, 'message notification is processed');
select is((select count(*)::integer from public.notifications_v1), 2, 'message attention is persisted independently');
select is((select count(*)::integer from private.notification_push_jobs_v1 where status = 'pending'), 2, 'provider events persist push work without deciding foreground suppression');
select is((select unread_count from private.home_conversation_projection_v1 where player_id = '20000000-0000-4000-8000-000000000402'), 3, 'Home receives exact authoritative unread count');
select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'read_advanced')) ->> 'processed')::boolean, 'read-advanced event is processed');
select is((select unread_count from private.home_conversation_projection_v1 where player_id = '20000000-0000-4000-8000-000000000402'), 0, 'read authority replaces unread with zero');
select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'profile_updated')) ->> 'processed')::boolean, 'profile update event invalidates Home projection');
select is((select profile_id::text from private.home_profile_projection_watermarks_v1 where player_id = '20000000-0000-4000-8000-000000000401'), '30000000-0000-4000-8000-000000000401', 'profile invalidation preserves canonical ProfileId');
select is((select profile_version::integer from private.home_profile_projection_watermarks_v1 where player_id = '20000000-0000-4000-8000-000000000401'), 3, 'profile invalidation records authoritative profile version');
select is((select source_event_id::text from private.home_profile_projection_watermarks_v1 where player_id = '20000000-0000-4000-8000-000000000401'), '80000000-0000-4000-8000-000000000411', 'profile invalidation records source EventId');
select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'delayed_message_notification')) ->> 'processed')::boolean, 'delayed attention event is persisted');
select is((select unread_count from private.home_conversation_projection_v1 where player_id = '20000000-0000-4000-8000-000000000402'), 0, 'out-of-order attention cannot regress unread');
select is(
  (
    select job.status::text
    from private.notification_push_jobs_v1 as job
    join public.notifications_v1 as notification on notification.id = job.notification_id
    where notification.source_event_id = '80000000-0000-4000-8000-000000000406'
  ),
  'suppressed',
  'out-of-order attention persists history without waking the user through stale push'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
select is(public.get_home_dashboard_v1() #>> '{recentMatches,0,kind}', 'rank', 'Home reads authoritative match kind');
select is(public.get_home_dashboard_v1() #>> '{recentMatches,0,status}', 'conversation_ready', 'Home reads authoritative match status');
select is((public.get_home_dashboard_v1() #>> '{conversations,0,unreadCount}')::integer, 0, 'Home uses conversation-owned unread projection');
select is(public.get_home_dashboard_v1() #>> '{recentMatches,0,matchedPlayer,profileId}', '30000000-0000-4000-8000-000000000401', 'Home returns canonical ProfileId');
select is(public.get_home_dashboard_v1() #>> '{recentMatches,0,matchedPlayer,displayName}', 'Return A', 'Home resolves display data through the explicit legacy profile bridge');
select is(public.get_home_current_profile_v1() ->> 'playerId', '20000000-0000-4000-8000-000000000402', 'Home profile returns canonical PlayerId');
select is(public.get_home_current_profile_v1() ->> 'profileId', '30000000-0000-4000-8000-000000000402', 'Home profile returns canonical ProfileId');
select is(public.get_home_current_profile_v1() ->> 'displayName', 'Return B', 'Home profile resolves legacy presentation through the explicit bridge');
select is(public.get_home_current_profile_v1() -> 'roleNames', '[]'::jsonb, 'Home profile returns a stable empty role collection');
reset role;

create temporary table claimed_push as
select public.claim_notification_push_jobs_v1(10) as jobs;
select is(jsonb_array_length((select jobs from claimed_push)), 2, 'push worker claims persisted jobs when no authoritative foreground presence suppresses them');
select ok(
  public.complete_notification_push_job_v1(
    ((select jobs from claimed_push) -> 0 ->> 'jobId')::uuid,
    'expo-ticket-return-loop-001',
    '{"status":"ok"}'::jsonb
  ),
  'push job can be acknowledged'
);
select is((select status::text from private.notification_push_jobs_v1 where provider_ticket_id is not null), 'delivered', 'push delivery provider result is observable');
select ok((public.consume_return_loop_event_v1((select payload from return_loop_events where name = 'suspended_notification')) ->> 'processed')::boolean, 'suspended recipient event is safely consumed');
select is((select count(*)::integer from public.notifications_v1 where recipient_player_id = '20000000-0000-4000-8000-000000000403'), 0, 'suspended recipient receives no notification');
select is((select count(*)::integer from private.return_loop_suppressed_events_v1 where recipient_player_id = '20000000-0000-4000-8000-000000000403'), 1, 'suspension policy is observable');

create temporary table lifecycle_suspension_event as
select jsonb_build_object(
  'eventId', '80000000-0000-4000-8000-000000000410',
  'eventType', 'player.suspended.v1',
  'aggregateType', 'player',
  'aggregateId', '20000000-0000-4000-8000-000000000403',
  'occurredAt', '2026-07-14T08:06:00.000Z',
  'correlationId', '70000000-0000-4000-8000-000000000403',
  'causationId', null,
  'data', jsonb_build_object(
    'accountId', '00000000-0000-0000-0000-000000000403',
    'playerId', '20000000-0000-4000-8000-000000000403',
    'profileId', '30000000-0000-4000-8000-000000000403',
    'lifecycleVersion', 2,
    'reasonCode', 'trust.return_loop_cloud_test'
  )
) as payload;
select is(
  (public.consume_return_loop_event_v1((select payload from lifecycle_suspension_event)) ->> 'processed')::boolean,
  true,
  'outer Return Loop consumer processes an authoritative suspension event'
);
select is(
  (public.consume_return_loop_event_v1((select payload from lifecycle_suspension_event)) ->> 'repeated')::boolean,
  true,
  'outer Return Loop consumer returns the durable replay receipt'
);

update private.return_loop_config_v1 set event_consumer_enabled = false;
select is(
  (public.consume_return_loop_event_v1(jsonb_set((select payload from return_loop_events where name = 'match_notification'), '{eventId}', '"80000000-0000-4000-8000-000000000409"')) ->> 'processed')::boolean,
  false,
  'event consumer kill switch leaves event replayable'
);
select is((select count(*)::integer from private.return_loop_processed_events_v1), 8, 'disabled event is not marked processed');

select * from finish();
rollback;
