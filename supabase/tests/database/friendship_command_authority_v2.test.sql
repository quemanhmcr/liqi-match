create extension if not exists pgtap with schema extensions;

begin;
select plan(34);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002301', 'authenticated', 'authenticated', 'friend-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002302', 'authenticated', 'authenticated', 'friend-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002303', 'authenticated', 'authenticated', 'friend-c@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002304', 'authenticated', 'authenticated', 'friend-suspended@example.test', 'x', now(), now(), now());
insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000002301', 'Friend A'),
  ('01000000-0000-4000-8000-000000002302', 'Friend B'),
  ('01000000-0000-4000-8000-000000002303', 'Friend C'),
  ('01000000-0000-4000-8000-000000002304', 'Friend Suspended');
insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002301', '01000000-0000-4000-8000-000000002301', '01000000-0000-4000-8000-000000002301', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002302', '01000000-0000-4000-8000-000000002302', '01000000-0000-4000-8000-000000002302', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002303', '01000000-0000-4000-8000-000000002303', '01000000-0000-4000-8000-000000002303', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002304', '01000000-0000-4000-8000-000000002304', '01000000-0000-4000-8000-000000002304', 'suspended', 2, false, false);
insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002301', '21000000-0000-4000-8000-000000002301', '01000000-0000-4000-8000-000000002301', 1, now()),
  ('31000000-0000-4000-8000-000000002302', '21000000-0000-4000-8000-000000002302', '01000000-0000-4000-8000-000000002302', 1, now()),
  ('31000000-0000-4000-8000-000000002303', '21000000-0000-4000-8000-000000002303', '01000000-0000-4000-8000-000000002303', 1, now()),
  ('31000000-0000-4000-8000-000000002304', '21000000-0000-4000-8000-000000002304', '01000000-0000-4000-8000-000000002304', 1, now());

update private.social_authority_config_v2
set writes_enabled = true
where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002301', true);

create temporary table request_ab as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:00:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'friend-request-ab'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002301',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'friend.request.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002302'
)) as receipt;

select is((select (receipt ->> 'repeated')::boolean from request_ab), false, 'first friendship request is not a replay');
select is((select receipt #>> '{relationship,friendship,state}' from request_ab), 'pending', 'request moves friendship projection to pending');
select is((select receipt #>> '{relationship,friendship,label}' from request_ab), 'pending_outgoing', 'requester receives outgoing label');
select is((select (receipt #>> '{relationship,version}')::integer from request_ab), 1, 'request advances relationship version to one');
select is((select jsonb_array_length(receipt -> 'eventIds') from request_ab), 1, 'request returns one authoritative event id');
select ok((select receipt #>> '{relationship,friendship,requestId}' is not null from request_ab), 'request receipt exposes canonical request id');

create temporary table replay_ab as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:00:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'friend-request-ab'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002301',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'friend.request.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002302'
)) as receipt;
select is((select (receipt ->> 'repeated')::boolean from replay_ab), true, 'same idempotency key returns durable replay');
select is(
  (select receipt -> 'eventIds' from replay_ab),
  (select receipt -> 'eventIds' from request_ab),
  'replay preserves original event id'
);

reset role;
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.requested.v2' and aggregate_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002301',
    '21000000-0000-4000-8000-000000002302'
  )),
  1,
  'request replay does not duplicate outbox event'
);
select is(
  (select count(*)::integer from private.audit_logs where action = 'friendship.requested.v2' and target_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002301',
    '21000000-0000-4000-8000-000000002302'
  )),
  1,
  'request records one server audit row'
);
select is(
  (select payload #>> '{eventVersion}' from private.outbox_events where event_type = 'friendship.requested.v2' and aggregate_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002301',
    '21000000-0000-4000-8000-000000002302'
  )),
  '2',
  'request outbox payload uses Core V2 envelope'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002302', true);
select is(
  public.get_relationship_v2('21000000-0000-4000-8000-000000002301') #>> '{friendship,label}',
  'pending_incoming',
  'recipient sees pending incoming relationship'
);

create temporary table reciprocal_ab as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:01:00.000Z',
    'clientPlatform', 'android',
    'clientVersion', '2.0.0',
    'requestId', 'friend-reciprocal-ab'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002302',
  'expectedRelationshipVersion', 1,
  'idempotencyKey', 'friend.request.ba.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002301'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,label}' from reciprocal_ab), 'friend', 'reciprocal request deterministically accepts older request');
select is((select (receipt #>> '{relationship,version}')::integer from reciprocal_ab), 2, 'reciprocal acceptance advances relationship version once');
select is(
  (select count(*)::integer from public.friendship_requests_v2 where relationship_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002301',
    '21000000-0000-4000-8000-000000002302'
  )),
  1,
  'reciprocal request does not create duplicate request rows'
);
select is(jsonb_array_length(public.list_friendships_v2() -> 'items'), 1, 'accepted friendship appears in authoritative list');

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002301', true);
create temporary table remove_ab as
select public.remove_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:02:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'friend-remove-ab'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002303',
  'expectedRelationshipVersion', 2,
  'idempotencyKey', 'friend.remove.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002302'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,state}' from remove_ab), 'removed', 'remove ends accepted friendship without deleting history');
select is((select (receipt #>> '{relationship,version}')::integer from remove_ab), 3, 'remove advances relationship version');
select is(jsonb_array_length(public.list_friendships_v2() -> 'items'), 0, 'removed friendship leaves active friendship list');

create temporary table request_ac as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:03:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'friend-request-ac'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002304',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'friend.request.ac.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002303'
)) as receipt;

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002303', true);
select throws_like(
  format(
    $$select public.accept_friendship_v2(%L::jsonb)$$,
    jsonb_build_object(
      'audit', jsonb_build_object(
        'clientCreatedAt', '2026-07-14T12:04:00.000Z',
        'clientPlatform', 'android',
        'clientVersion', '2.0.0',
        'requestId', 'friend-accept-ac-stale'
      ),
      'correlationId', '43000000-0000-4000-8000-000000002305',
      'expectedRelationshipVersion', 0,
      'expectedRequestVersion', 1,
      'friendshipRequestId', (select receipt #>> '{relationship,friendship,requestId}' from request_ac),
      'idempotencyKey', 'friend.accept.ac.stale.1'
    )::text
  ),
  '%relationship_version_conflict%',
  'accept rejects stale relationship version'
);

create temporary table decline_ac as
select public.decline_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:05:00.000Z',
    'clientPlatform', 'android',
    'clientVersion', '2.0.0',
    'requestId', 'friend-decline-ac'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002306',
  'expectedRelationshipVersion', 1,
  'expectedRequestVersion', 1,
  'friendshipRequestId', (select receipt #>> '{relationship,friendship,requestId}' from request_ac),
  'idempotencyKey', 'friend.decline.ac.0001'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,state}' from decline_ac), 'none', 'recipient can decline pending request');
select is((select (receipt #>> '{relationship,version}')::integer from decline_ac), 2, 'decline advances relationship version');

create temporary table request_ca as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:06:00.000Z',
    'clientPlatform', 'android',
    'clientVersion', '2.0.0',
    'requestId', 'friend-request-ca'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002307',
  'expectedRelationshipVersion', 2,
  'idempotencyKey', 'friend.request.ca.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002301'
)) as receipt;
create temporary table cancel_ca as
select public.cancel_friendship_request_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:07:00.000Z',
    'clientPlatform', 'android',
    'clientVersion', '2.0.0',
    'requestId', 'friend-cancel-ca'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002308',
  'expectedRelationshipVersion', 3,
  'expectedRequestVersion', 1,
  'friendshipRequestId', (select receipt #>> '{relationship,friendship,requestId}' from request_ca),
  'idempotencyKey', 'friend.cancel.ca.0001'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,state}' from cancel_ca), 'none', 'sender can cancel pending request');
select is((select (receipt #>> '{relationship,version}')::integer from cancel_ca), 4, 'cancel advances relationship version');

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002302', true);
create temporary table request_bc as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:08:00.000Z',
    'clientPlatform', 'android',
    'clientVersion', '2.0.0',
    'requestId', 'friend-request-bc'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002309',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'friend.request.bc.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002303'
)) as receipt;
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002303', true);
create temporary table accept_bc as
select public.accept_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T12:09:00.000Z',
    'clientPlatform', 'android',
    'clientVersion', '2.0.0',
    'requestId', 'friend-accept-bc'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002310',
  'expectedRelationshipVersion', 1,
  'expectedRequestVersion', 1,
  'friendshipRequestId', (select receipt #>> '{relationship,friendship,requestId}' from request_bc),
  'idempotencyKey', 'friend.accept.bc.0001'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,label}' from accept_bc), 'friend', 'recipient can explicitly accept pending request');
select is((select receipt #>> '{relationship,friendship,requestState}' from accept_bc), 'accepted', 'accept updates request lifecycle authoritatively');

reset role;
update public.player_privacy_settings_v2
set friendship_requests = 'nobody', version = version + 1
where player_id = '21000000-0000-4000-8000-000000002302';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002301', true);
select throws_like(
  $$select public.request_friendship_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T12:10:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'friend-request-ab-private'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002311',
    'expectedRelationshipVersion', 3,
    'idempotencyKey', 'friend.request.ab.private',
    'targetPlayerId', '21000000-0000-4000-8000-000000002302'
  ))$$,
  '%friendship_request_forbidden%',
  'target privacy denies new friendship request'
);
select throws_like(
  $$select public.request_friendship_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T12:11:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'friend-self'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002312',
    'expectedRelationshipVersion', 0,
    'idempotencyKey', 'friend.request.self.001',
    'targetPlayerId', '21000000-0000-4000-8000-000000002301'
  ))$$,
  '%relationship_self_forbidden%',
  'cannot friend self'
);
select throws_like(
  $$select public.request_friendship_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T12:00:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'friend-request-ab'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002301',
    'expectedRelationshipVersion', 0,
    'idempotencyKey', 'friend.request.ab.0001',
    'targetPlayerId', '21000000-0000-4000-8000-000000002303'
  ))$$,
  '%idempotency_key_reused%',
  'idempotency key cannot be reused for different target'
);

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002304', true);
select throws_like(
  $$select public.request_friendship_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T12:12:00.000Z',
      'clientPlatform', 'android',
      'clientVersion', '2.0.0',
      'requestId', 'friend-suspended'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002313',
    'expectedRelationshipVersion', 0,
    'idempotencyKey', 'friend.request.suspended',
    'targetPlayerId', '21000000-0000-4000-8000-000000002301'
  ))$$,
  '%relationship_player_not_active%',
  'suspended player cannot create relationship mutation'
);

reset role;
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.accepted.v2'),
  2,
  'reciprocal and explicit accept each produce one accepted event'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.declined.v2'),
  1,
  'decline produces one event'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.cancelled.v2'),
  1,
  'cancel produces one event'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.removed.v2'),
  1,
  'remove produces one event while preserving relationship row'
);

select * from finish();
rollback;
