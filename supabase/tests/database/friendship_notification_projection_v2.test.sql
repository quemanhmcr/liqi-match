create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000013111', 'authenticated', 'authenticated', 'friend-notify-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000013112', 'authenticated', 'authenticated', 'friend-notify-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000013113', 'authenticated', 'authenticated', 'friend-notify-c@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000013114', 'authenticated', 'authenticated', 'friend-notify-d@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('01000000-0000-4000-8000-000000013111', 'Friend Notify A'),
  ('01000000-0000-4000-8000-000000013112', 'Friend Notify B'),
  ('01000000-0000-4000-8000-000000013113', 'Friend Notify C'),
  ('01000000-0000-4000-8000-000000013114', 'Friend Notify D');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000013111', '01000000-0000-4000-8000-000000013111', '01000000-0000-4000-8000-000000013111', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000013112', '01000000-0000-4000-8000-000000013112', '01000000-0000-4000-8000-000000013112', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000013113', '01000000-0000-4000-8000-000000013113', '01000000-0000-4000-8000-000000013113', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000013114', '01000000-0000-4000-8000-000000013114', '01000000-0000-4000-8000-000000013114', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000013111', '21000000-0000-4000-8000-000000013111', '01000000-0000-4000-8000-000000013111', 1, now()),
  ('31000000-0000-4000-8000-000000013112', '21000000-0000-4000-8000-000000013112', '01000000-0000-4000-8000-000000013112', 1, now()),
  ('31000000-0000-4000-8000-000000013113', '21000000-0000-4000-8000-000000013113', '01000000-0000-4000-8000-000000013113', 1, now()),
  ('31000000-0000-4000-8000-000000013114', '21000000-0000-4000-8000-000000013114', '01000000-0000-4000-8000-000000013114', 1, now());

update private.return_loop_config_v1
set event_consumer_enabled = true,
    notification_inbox_enabled = true,
    push_enabled = true,
    deep_links_enabled = true,
    inbox_rollout_percent = 100,
    push_rollout_percent = 100,
    deep_link_rollout_percent = 100
where singleton;

create temporary table requested_source as
select private.enqueue_contract_event_v2(
  'friendship.requested.v2',
  'friendship_request',
  '41000000-0000-4000-8000-000000013111',
  1,
  '21000000-0000-4000-8000-000000013111',
  '71000000-0000-4000-8000-000000013111',
  null,
  jsonb_build_object(
    'friendshipRequestId', '42000000-0000-4000-8000-000000013111',
    'requesterPlayerId', '21000000-0000-4000-8000-000000013111',
    'recipientPlayerId', '21000000-0000-4000-8000-000000013112',
    'requestState', 'pending',
    'friendshipLabel', 'pending_incoming',
    'expiresAt', '2026-07-21T13:11:00Z'
  ),
  'friendship-requested-notification-test-1311'
) as source_event_id;

create temporary table requested_projection as
select event.id as projected_event_id, event.payload
from private.outbox_events event
where event.event_type = 'notification.requested.v1'
  and event.causation_id = (select source_event_id from requested_source);
grant select on requested_projection to authenticated;

select is(
  (select count(*)::integer from requested_projection),
  1,
  'friendship request projects exactly one notification request event'
);
select is(
  (select payload ->> 'causationId' from requested_projection),
  (select source_event_id::text from requested_source),
  'projected notification preserves the friendship event as causation'
);
select is(
  (select payload #>> '{data,reasonCode}' from requested_projection),
  'friendship_requested',
  'request projection uses the stable friendship notification reason code'
);
select is(
  (select payload #>> '{data,target,playerId}' from requested_projection),
  '21000000-0000-4000-8000-000000013111',
  'request notification deep-links to the requester PlayerId'
);

create temporary table requested_consume as
select public.consume_return_loop_event_v1(
  (select payload from requested_projection)
) as receipt;
select is(
  (select (receipt ->> 'processed')::boolean from requested_consume),
  true,
  'Return Loop consumes the projected friendship notification'
);
select is(
  (select kind::text from public.notifications_v1 where source_event_id = (select projected_event_id from requested_projection)),
  'friendship_requested',
  'persisted request notification uses the friendship enum kind'
);
select is(
  (select deep_link ->> 'playerId' from public.notifications_v1 where source_event_id = (select projected_event_id from requested_projection)),
  '21000000-0000-4000-8000-000000013111',
  'persisted request notification stores only the canonical profile target'
);
select is(
  (select count(*)::integer from private.notification_push_jobs_v1 where notification_id = (select id from public.notifications_v1 where source_event_id = (select projected_event_id from requested_projection))),
  1,
  'existing push lifecycle receives the friendship notification'
);

create temporary table requested_notification as
select id
from public.notifications_v1
where source_event_id = (select projected_event_id from requested_projection);
grant select on requested_notification to authenticated;

select private.project_friendship_notification_v2(
  (select payload from private.outbox_events where id = (select source_event_id from requested_source))
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'notification.requested.v1' and causation_id = (select source_event_id from requested_source)),
  1,
  'friendship event replay does not create a duplicate notification request'
);

create temporary table accepted_source as
select private.enqueue_contract_event_v2(
  'friendship.accepted.v2',
  'social_relationship',
  '41000000-0000-4000-8000-000000013112',
  2,
  '21000000-0000-4000-8000-000000013112',
  '71000000-0000-4000-8000-000000013112',
  '81000000-0000-4000-8000-000000013112',
  jsonb_build_object(
    'friendshipRequestId', '42000000-0000-4000-8000-000000013111',
    'requesterPlayerId', '21000000-0000-4000-8000-000000013111',
    'recipientPlayerId', '21000000-0000-4000-8000-000000013112',
    'requestState', 'accepted',
    'friendshipLabel', 'friend'
  ),
  'friendship-accepted-notification-test-1311'
) as source_event_id;
create temporary table accepted_projection as
select event.id as projected_event_id, event.payload
from private.outbox_events event
where event.event_type = 'notification.requested.v1'
  and event.causation_id = (select source_event_id from accepted_source);
select is(
  (select payload #>> '{data,recipientPlayerId}' from accepted_projection),
  '21000000-0000-4000-8000-000000013111',
  'accepted notification returns to the original requester'
);
select is(
  (select payload ->> 'causationId' from accepted_projection),
  (select source_event_id::text from accepted_source),
  'accepted notification remains causally linked to friendship.accepted.v2'
);
select is(
  (select payload #>> '{data,target,playerId}' from accepted_projection),
  '21000000-0000-4000-8000-000000013112',
  'accepted notification opens the player who accepted'
);
select public.consume_return_loop_event_v1((select payload from accepted_projection));
select is(
  (select kind::text from public.notifications_v1 where source_event_id = (select projected_event_id from accepted_projection)),
  'friendship_accepted',
  'accepted projection persists through the existing inbox authority'
);

insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, version
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000013113',
    '21000000-0000-4000-8000-000000013114'
  ),
  '21000000-0000-4000-8000-000000013113',
  '21000000-0000-4000-8000-000000013114',
  1
);
insert into public.player_blocks_v2 (
  relationship_id, blocker_player_id, blocked_player_id, active, version
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000013113',
    '21000000-0000-4000-8000-000000013114'
  ),
  '21000000-0000-4000-8000-000000013114',
  '21000000-0000-4000-8000-000000013113',
  true,
  1
);

create temporary table blocked_source as
select private.enqueue_contract_event_v2(
  'friendship.requested.v2',
  'friendship_request',
  '41000000-0000-4000-8000-000000013113',
  1,
  '21000000-0000-4000-8000-000000013113',
  '71000000-0000-4000-8000-000000013113',
  null,
  jsonb_build_object(
    'friendshipRequestId', '42000000-0000-4000-8000-000000013113',
    'requesterPlayerId', '21000000-0000-4000-8000-000000013113',
    'recipientPlayerId', '21000000-0000-4000-8000-000000013114',
    'requestState', 'pending',
    'friendshipLabel', 'pending_incoming',
    'expiresAt', '2026-07-21T13:11:00Z'
  ),
  'friendship-blocked-notification-test-1311'
) as source_event_id;
create temporary table blocked_projection as
select event.id as projected_event_id, event.payload
from private.outbox_events event
where event.event_type = 'notification.requested.v1'
  and event.causation_id = (select source_event_id from blocked_source);
select public.consume_return_loop_event_v1((select payload from blocked_projection));
select is(
  (select count(*)::integer from public.notifications_v1 where source_event_id = (select projected_event_id from blocked_projection)),
  0,
  'block before persistence suppresses the friendship inbox row'
);
select is(
  (select reason from private.return_loop_suppressed_events_v1 where event_id = (select projected_event_id from blocked_projection)),
  'relationship_blocked',
  'block suppression is observable with a stable reason'
);

insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, version
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000013111',
    '21000000-0000-4000-8000-000000013112'
  ),
  '21000000-0000-4000-8000-000000013111',
  '21000000-0000-4000-8000-000000013112',
  1
);
insert into public.player_blocks_v2 (
  relationship_id, blocker_player_id, blocked_player_id, active, version
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000013111',
    '21000000-0000-4000-8000-000000013112'
  ),
  '21000000-0000-4000-8000-000000013112',
  '21000000-0000-4000-8000-000000013111',
  true,
  1
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000013112', true);
select set_config('request.jwt.claim.session_id', '61000000-0000-4000-8000-000000013112', true);
select set_config('request.jwt.claim.iat', extract(epoch from now() - interval '1 minute')::bigint::text, true);
select set_config('request.jwt.claim.exp', extract(epoch from now() + interval '1 hour')::bigint::text, true);
select is(
  public.resolve_notification_deep_link_v1(
    (select id from requested_notification),
    (select projected_event_id from requested_projection)
  ) ->> 'status',
  'expired',
  'block after persistence revokes the old friendship notification deep link'
);

select * from finish();
rollback;
