create extension if not exists pgtap with schema extensions;
begin;
select plan(33);

select has_table('private', 'activity_notification_events_v2', 'event replay receipts exist');
select has_table('private', 'activity_notification_deliveries_v2', 'semantic deliveries exist');
select has_table('private', 'activity_notification_click_facts_v2', 'click facts exist');
select has_function('private', 'consume_activity_notification_requested_v2', array['jsonb'], 'Core V2 delivery consumer exists');
select has_function('public', 'resolve_notification_deep_link_v1', array['uuid','uuid'], 'canonical resolver remains public');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000701','authenticated','authenticated','activity-a@example.test','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000702','authenticated','authenticated','activity-b@example.test','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000703','authenticated','authenticated','activity-c@example.test','x',now(),now(),now());
insert into public.profiles (id, display_name) values
 ('00000000-0000-0000-0000-000000000701','Activity A'),
 ('00000000-0000-0000-0000-000000000702','Activity B'),
 ('00000000-0000-0000-0000-000000000703','Activity C');
insert into public.players (
 id, account_id, auth_user_id, lifecycle_state, lifecycle_version, discoverable, messaging_allowed
) values
 ('20000000-0000-4000-8000-000000000701','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000701','active',2,true,true),
 ('20000000-0000-4000-8000-000000000702','00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000702','active',2,true,true),
 ('20000000-0000-4000-8000-000000000703','00000000-0000-0000-0000-000000000703','00000000-0000-0000-0000-000000000703','suspended',3,false,false);
insert into public.player_profiles_v1 (id, player_id, legacy_profile_id, version, completed_at) values
 ('30000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000701','00000000-0000-0000-0000-000000000701',2,now()),
 ('30000000-0000-4000-8000-000000000702','20000000-0000-4000-8000-000000000702','00000000-0000-0000-0000-000000000702',2,now()),
 ('30000000-0000-4000-8000-000000000703','20000000-0000-4000-8000-000000000703','00000000-0000-0000-0000-000000000703',2,now());
update private.return_loop_config_v1 set
 event_consumer_enabled=true, notification_inbox_enabled=true, push_enabled=true,
 deep_links_enabled=true, inbox_rollout_percent=100, push_rollout_percent=100,
 deep_link_rollout_percent=100;

insert into public.session_outcomes_v2 (
 id, session_id, source_event_id, source_session_version, participant_player_ids,
 role_assignments, source, started_at, completed_at, confirmation_deadline_at
) values (
 '44000000-0000-4000-8000-000000000701','42000000-0000-4000-8000-000000000701',
 '43000000-0000-4000-8000-000000000700',9,
 array['20000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000702']::uuid[],
 '[]','{"kind":"manual"}','2026-07-14T10:00:00Z','2026-07-14T11:00:00Z','2026-07-17T11:00:00Z'
);
insert into public.activity_items_v2 (id, player_id, kind, payload, priority, deduplication_key, version, created_at)
values
 ('47000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000701','feedback_prompt','{"sessionId":"42000000-0000-4000-8000-000000000701","outcomeId":"44000000-0000-4000-8000-000000000701","confirmationDeadlineAt":"2026-07-17T11:00:00Z"}',1000,'feedback:42000000-0000-4000-8000-000000000701:20000000-0000-4000-8000-000000000701',1,'2026-07-14T11:00:01Z'),
 ('47000000-0000-4000-8000-000000000702','20000000-0000-4000-8000-000000000701','repeat_play_recommendation','{"completedSessionCount":2,"relationshipId":"47000000-0000-4000-8000-000000000799","relationshipVersion":1,"sourceSessionId":"42000000-0000-4000-8000-000000000701","teammatePlayerIds":["20000000-0000-4000-8000-000000000702"]}',800,'repeat:activity:frequency:000000000702',1,'2026-07-14T11:00:02Z'),
 ('47000000-0000-4000-8000-000000000703','20000000-0000-4000-8000-000000000701','reputation_progress','{"sessionId":"42000000-0000-4000-8000-000000000701","projectionVersion":3}',500,'reputation:activity:disabled:000000000703',1,'2026-07-14T11:00:03Z'),
 ('47000000-0000-4000-8000-000000000704','20000000-0000-4000-8000-000000000701','repeat_play_recommendation','{"completedSessionCount":2,"relationshipId":"47000000-0000-4000-8000-000000000798","relationshipVersion":1,"sourceSessionId":"42000000-0000-4000-8000-000000000701","teammatePlayerIds":["20000000-0000-4000-8000-000000000702"]}',800,'repeat:activity:dismissed:000000000704',1,'2026-07-14T11:00:04Z'),
 ('47000000-0000-4000-8000-000000000705','20000000-0000-4000-8000-000000000703','reputation_progress','{"sessionId":"42000000-0000-4000-8000-000000000701","projectionVersion":1}',500,'reputation:activity:suspended:000000000705',1,'2026-07-14T11:00:05Z');

create temporary table activity_events(name text primary key, payload jsonb not null);
insert into activity_events(name,payload)
select 'feedback', jsonb_build_object(
 'eventId','49000000-0000-4000-8000-000000000701','eventType','activity.notification_requested.v2','eventVersion',2,
 'aggregateType','activity_item','aggregateId',a.id,'aggregateVersion',a.version,'actorPlayerId',null,
 'correlationId','43000000-0000-4000-8000-000000000702','causationId','43000000-0000-4000-8000-000000000701',
 'occurredAt','2026-07-14T11:00:10Z','payload',jsonb_build_object('request',jsonb_build_object(
   'activityItem',private.activity_item_snapshot_v2(a.id),
   'sourceEventId','43000000-0000-4000-8000-000000000701','causationId','43000000-0000-4000-8000-000000000700',
   'correlationId','43000000-0000-4000-8000-000000000702',
   'target',jsonb_build_object('target','session_feedback','sessionId','42000000-0000-4000-8000-000000000701','outcomeId','44000000-0000-4000-8000-000000000701'),
   'deliveryDecision',jsonb_build_object('decisionId','48000000-0000-4000-8000-000000000701','engagementPreferencesVersion',1,'evaluatedAt','2026-07-14T11:00:09Z','frequencyWindowKey','2026-07-14:Asia/Bangkok','inboxAllowed',true,'maxReactivationNotificationsPerDay',2,'pushAllowed',true,'reactivationNotificationsUsed',0,'reason','eligible')
 ))) from public.activity_items_v2 a where a.id='47000000-0000-4000-8000-000000000701';
insert into activity_events(name,payload)
select 'frequency', jsonb_build_object(
 'eventId','49000000-0000-4000-8000-000000000702','eventType','activity.notification_requested.v2','eventVersion',2,
 'aggregateType','activity_item','aggregateId',a.id,'aggregateVersion',a.version,'actorPlayerId',null,
 'correlationId','43000000-0000-4000-8000-000000000702','causationId','43000000-0000-4000-8000-000000000712',
 'occurredAt','2026-07-14T11:00:11Z','payload',jsonb_build_object('request',jsonb_build_object(
   'activityItem',private.activity_item_snapshot_v2(a.id),'sourceEventId','43000000-0000-4000-8000-000000000712','causationId','43000000-0000-4000-8000-000000000700','correlationId','43000000-0000-4000-8000-000000000702',
   'target',jsonb_build_object('target','repeat_play','sourceSessionId','42000000-0000-4000-8000-000000000701','teammatePlayerIds',jsonb_build_array('20000000-0000-4000-8000-000000000702')),
   'deliveryDecision',jsonb_build_object('decisionId','48000000-0000-4000-8000-000000000702','engagementPreferencesVersion',1,'evaluatedAt','2026-07-14T11:00:09Z','frequencyWindowKey','2026-07-14:Asia/Bangkok','inboxAllowed',true,'maxReactivationNotificationsPerDay',2,'pushAllowed',false,'reactivationNotificationsUsed',2,'reason','frequency_capped')
 ))) from public.activity_items_v2 a where a.id='47000000-0000-4000-8000-000000000702';
insert into activity_events(name,payload)
select 'disabled', jsonb_build_object(
 'eventId','49000000-0000-4000-8000-000000000703','eventType','activity.notification_requested.v2','eventVersion',2,
 'aggregateType','activity_item','aggregateId',a.id,'aggregateVersion',a.version,'actorPlayerId',null,'correlationId','43000000-0000-4000-8000-000000000702','causationId','43000000-0000-4000-8000-000000000713','occurredAt','2026-07-14T11:00:12Z',
 'payload',jsonb_build_object('request',jsonb_build_object('activityItem',private.activity_item_snapshot_v2(a.id),'sourceEventId','43000000-0000-4000-8000-000000000713','causationId','43000000-0000-4000-8000-000000000700','correlationId','43000000-0000-4000-8000-000000000702','target',jsonb_build_object('target','reputation','playerId','20000000-0000-4000-8000-000000000701'),'deliveryDecision',jsonb_build_object('decisionId','48000000-0000-4000-8000-000000000703','engagementPreferencesVersion',1,'evaluatedAt','2026-07-14T11:00:09Z','frequencyWindowKey','2026-07-14:Asia/Bangkok','inboxAllowed',false,'maxReactivationNotificationsPerDay',2,'pushAllowed',false,'reactivationNotificationsUsed',0,'reason','activity_disabled')))
 ) from public.activity_items_v2 a where a.id='47000000-0000-4000-8000-000000000703';
insert into activity_events(name,payload)
select 'dismissed', jsonb_build_object(
 'eventId','49000000-0000-4000-8000-000000000704','eventType','activity.notification_requested.v2','eventVersion',2,
 'aggregateType','activity_item','aggregateId',a.id,'aggregateVersion',a.version,'actorPlayerId',null,'correlationId','43000000-0000-4000-8000-000000000702','causationId','43000000-0000-4000-8000-000000000714','occurredAt','2026-07-14T11:00:13Z',
 'payload',jsonb_build_object('request',jsonb_build_object('activityItem',private.activity_item_snapshot_v2(a.id),'sourceEventId','43000000-0000-4000-8000-000000000714','causationId','43000000-0000-4000-8000-000000000700','correlationId','43000000-0000-4000-8000-000000000702','target',jsonb_build_object('target','repeat_play','sourceSessionId','42000000-0000-4000-8000-000000000701','teammatePlayerIds',jsonb_build_array('20000000-0000-4000-8000-000000000702')),'deliveryDecision',jsonb_build_object('decisionId','48000000-0000-4000-8000-000000000704','engagementPreferencesVersion',1,'evaluatedAt','2026-07-14T11:00:09Z','frequencyWindowKey','2026-07-14:Asia/Bangkok','inboxAllowed',true,'maxReactivationNotificationsPerDay',2,'pushAllowed',true,'reactivationNotificationsUsed',0,'reason','eligible')))
 ) from public.activity_items_v2 a where a.id='47000000-0000-4000-8000-000000000704';
update public.activity_items_v2 set dismissed_at='2026-07-14T11:00:12Z', version=2, updated_at='2026-07-14T11:00:12Z' where id='47000000-0000-4000-8000-000000000704';
insert into activity_events(name,payload)
select 'suspended', jsonb_build_object(
 'eventId','49000000-0000-4000-8000-000000000705','eventType','activity.notification_requested.v2','eventVersion',2,
 'aggregateType','activity_item','aggregateId',a.id,'aggregateVersion',a.version,'actorPlayerId',null,'correlationId','43000000-0000-4000-8000-000000000702','causationId','43000000-0000-4000-8000-000000000715','occurredAt','2026-07-14T11:00:14Z',
 'payload',jsonb_build_object('request',jsonb_build_object('activityItem',private.activity_item_snapshot_v2(a.id),'sourceEventId','43000000-0000-4000-8000-000000000715','causationId','43000000-0000-4000-8000-000000000700','correlationId','43000000-0000-4000-8000-000000000702','target',jsonb_build_object('target','reputation','playerId','20000000-0000-4000-8000-000000000703'),'deliveryDecision',jsonb_build_object('decisionId','48000000-0000-4000-8000-000000000705','engagementPreferencesVersion',1,'evaluatedAt','2026-07-14T11:00:09Z','frequencyWindowKey','2026-07-14:Asia/Bangkok','inboxAllowed',true,'maxReactivationNotificationsPerDay',2,'pushAllowed',true,'reactivationNotificationsUsed',0,'reason','eligible')))
 ) from public.activity_items_v2 a where a.id='47000000-0000-4000-8000-000000000705';

select ok((private.consume_activity_notification_requested_v2((select payload from activity_events where name='feedback'))->>'processed')::boolean,'eligible feedback is processed');
select is((select count(*)::integer from public.notifications_v1),1,'eligible feedback creates one inbox item');
select is((select deep_link->>'target' from public.notifications_v1 limit 1),'session_feedback','feedback keeps semantic destination');
select is((select deep_link->>'sessionId' from public.notifications_v1 limit 1),'42000000-0000-4000-8000-000000000701','feedback keeps exact SessionId');
select is((select count(*)::integer from private.notification_push_jobs_v1 where status='pending'),1,'eligible feedback creates pending push');
select is((select inbox_status from private.activity_notification_deliveries_v2 where activity_item_id='47000000-0000-4000-8000-000000000701'),'queued','eligible inbox receipt is queued');
select is((select push_status from private.activity_notification_deliveries_v2 where activity_item_id='47000000-0000-4000-8000-000000000701'),'queued','eligible push receipt is queued');
select ok((private.consume_activity_notification_requested_v2((select payload from activity_events where name='feedback'))->>'repeated')::boolean,'same EventId replays idempotently');
select is((select count(*)::integer from public.notifications_v1),1,'EventId replay does not duplicate inbox');

select ok((private.consume_activity_notification_requested_v2((select payload from activity_events where name='frequency'))->>'processed')::boolean,'frequency-capped request is processed');
select is((select count(*)::integer from public.notifications_v1),2,'frequency cap preserves inbox activity');
select is((select push_status from private.activity_notification_deliveries_v2 where activity_item_id='47000000-0000-4000-8000-000000000702'),'suppressed_by_supplier','frequency cap preserves supplier push suppression');
select is((select count(*)::integer from private.notification_push_jobs_v1 where status='pending'),1,'frequency cap creates no extra push job');

select ok((private.consume_activity_notification_requested_v2((select payload from activity_events where name='disabled'))->>'processed')::boolean,'activity-disabled request is consumed');
select is((select inbox_status from private.activity_notification_deliveries_v2 where activity_item_id='47000000-0000-4000-8000-000000000703'),'suppressed_by_supplier','disabled inbox suppression is observable');
select is((select count(*)::integer from public.notifications_v1),2,'disabled activity creates no inbox item');

select ok((private.consume_activity_notification_requested_v2((select payload from activity_events where name='dismissed'))->>'processed')::boolean,'dismiss race is consumed');
select is((select runtime_suppression_reason from private.activity_notification_deliveries_v2 where activity_item_id='47000000-0000-4000-8000-000000000704'),'activity_dismissed_before_delivery','dismiss race has stable suppression reason');
select is((select count(*)::integer from public.notifications_v1),2,'dismiss race creates no inbox item');

select ok((private.consume_activity_notification_requested_v2((select payload from activity_events where name='suspended'))->>'processed')::boolean,'suspended lifecycle request is consumed');
select is((select inbox_status from private.activity_notification_deliveries_v2 where activity_item_id='47000000-0000-4000-8000-000000000705'),'suppressed_by_delivery_runtime','suspended recipient is runtime-suppressed');
select is((select count(*)::integer from public.notifications_v1),2,'suspended recipient receives no inbox item');

select set_config('test.activity_notification_id',(select id::text from public.notifications_v1 where deep_link->>'target'='session_feedback'),true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000701',true);
select is(public.resolve_notification_deep_link_v1(current_setting('test.activity_notification_id')::uuid,'49000000-0000-4000-8000-000000000701')->>'status','available','participant resolves feedback destination');
select is(public.resolve_notification_deep_link_v1(current_setting('test.activity_notification_id')::uuid,'49000000-0000-4000-8000-000000000701')#>>'{deepLink,target}','session_feedback','resolver returns canonical feedback deep link');
reset role;
select is((select count(*)::integer from private.activity_notification_click_facts_v2),1,'repeat click resolution records one immutable click fact');
select is((select correlation_id::text from private.activity_notification_click_facts_v2),'43000000-0000-4000-8000-000000000702','click fact preserves correlation');
select is((select source_event_id::text from private.activity_notification_click_facts_v2),'43000000-0000-4000-8000-000000000701','click fact preserves activity source event');
select is((select count(*)::integer from private.activity_notification_events_v2),5,'every consumed outer event has a replay receipt');

select * from finish();
rollback;
