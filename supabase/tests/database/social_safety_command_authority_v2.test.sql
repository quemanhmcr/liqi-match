create extension if not exists pgtap with schema extensions;

begin;
select plan(35);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002401', 'authenticated', 'authenticated', 'safety-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002402', 'authenticated', 'authenticated', 'safety-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002403', 'authenticated', 'authenticated', 'safety-c@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002404', 'authenticated', 'authenticated', 'safety-suspended@example.test', 'x', now(), now(), now());
insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000002401', 'Safety A'),
  ('01000000-0000-4000-8000-000000002402', 'Safety B'),
  ('01000000-0000-4000-8000-000000002403', 'Safety C'),
  ('01000000-0000-4000-8000-000000002404', 'Safety Suspended');
insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002401', '01000000-0000-4000-8000-000000002401', '01000000-0000-4000-8000-000000002401', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002402', '01000000-0000-4000-8000-000000002402', '01000000-0000-4000-8000-000000002402', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002403', '01000000-0000-4000-8000-000000002403', '01000000-0000-4000-8000-000000002403', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002404', '01000000-0000-4000-8000-000000002404', '01000000-0000-4000-8000-000000002404', 'suspended', 2, false, false);
insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002401', '21000000-0000-4000-8000-000000002401', '01000000-0000-4000-8000-000000002401', 1, now()),
  ('31000000-0000-4000-8000-000000002402', '21000000-0000-4000-8000-000000002402', '01000000-0000-4000-8000-000000002402', 1, now()),
  ('31000000-0000-4000-8000-000000002403', '21000000-0000-4000-8000-000000002403', '01000000-0000-4000-8000-000000002403', 1, now()),
  ('31000000-0000-4000-8000-000000002404', '21000000-0000-4000-8000-000000002404', '01000000-0000-4000-8000-000000002404', 1, now());
update private.social_authority_config_v2 set writes_enabled = true where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002401', true);
create temporary table request_ab as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:00:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-request-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002401',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'safety.friend.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002402'
)) as receipt;
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002402', true);
create temporary table accept_ab as
select public.accept_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:01:00.000Z', 'clientPlatform', 'android', 'clientVersion', '2.0.0', 'requestId', 'safety-accept-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002402',
  'expectedRelationshipVersion', 1,
  'expectedRequestVersion', 1,
  'friendshipRequestId', (select receipt #>> '{relationship,friendship,requestId}' from request_ab),
  'idempotencyKey', 'safety.accept.ab.001'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,label}' from accept_ab), 'friend', 'fixture starts with accepted friendship');

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002401', true);
create temporary table mute_ab as
select public.mute_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:02:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-mute-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002403',
  'expectedRelationshipVersion', 2,
  'idempotencyKey', 'safety.mute.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002402'
)) as receipt;
select is((select (receipt #>> '{relationship,mute,viewerMutedTarget}')::boolean from mute_ab), true, 'mute is directional and visible to muter');
select is((select receipt #>> '{relationship,friendship,label}' from mute_ab), 'friend', 'mute does not redefine friendship');
select is((select (receipt #>> '{relationship,capabilities,canMessage}')::boolean from mute_ab), true, 'mute does not revoke authoritative send capability');
select is((select (receipt #>> '{relationship,version}')::integer from mute_ab), 3, 'mute advances relationship aggregate version');

create temporary table replay_mute_ab as
select public.mute_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:02:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-mute-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002403',
  'expectedRelationshipVersion', 2,
  'idempotencyKey', 'safety.mute.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002402'
)) as receipt;
select is((select (receipt ->> 'repeated')::boolean from replay_mute_ab), true, 'mute retry returns durable receipt');
select is((select receipt -> 'eventIds' from replay_mute_ab), (select receipt -> 'eventIds' from mute_ab), 'mute replay preserves event identity');
select throws_like(
  $$select public.mute_player_v2(jsonb_build_object(
    'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:03:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-mute-ab-again'),
    'correlationId', '43000000-0000-4000-8000-000000002404',
    'expectedRelationshipVersion', 3,
    'idempotencyKey', 'safety.mute.ab.0002',
    'targetPlayerId', '21000000-0000-4000-8000-000000002402'
  ))$$,
  '%mute_already_active%',
  'different command cannot duplicate active mute'
);

create temporary table unmute_ab as
select public.unmute_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:04:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-unmute-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002405',
  'expectedRelationshipVersion', 3,
  'idempotencyKey', 'safety.unmute.ab.001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002402'
)) as receipt;
select is((select (receipt #>> '{relationship,mute,viewerMutedTarget}')::boolean from unmute_ab), false, 'unmute clears directional preference');
select is((select receipt #>> '{relationship,friendship,label}' from unmute_ab), 'friend', 'unmute leaves friendship unchanged');
select throws_like(
  $$select public.unmute_player_v2(jsonb_build_object(
    'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:05:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-unmute-missing'),
    'correlationId', '43000000-0000-4000-8000-000000002406',
    'expectedRelationshipVersion', 4,
    'idempotencyKey', 'safety.unmute.ab.002',
    'targetPlayerId', '21000000-0000-4000-8000-000000002402'
  ))$$,
  '%mute_not_found%',
  'unmute rejects missing active mute'
);

create temporary table block_ab as
select public.block_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:06:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-block-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002407',
  'expectedRelationshipVersion', 4,
  'idempotencyKey', 'safety.block.ab.0001',
  'reasonCode', 'user_safety',
  'targetPlayerId', '21000000-0000-4000-8000-000000002402'
)) as receipt;
select is((select (receipt #>> '{relationship,capabilities,blocked}')::boolean from block_ab), true, 'block activates absolute capability override');
select is((select receipt #>> '{relationship,friendship,state}' from block_ab), 'removed', 'block ends accepted friendship without deleting history');
select is((select (receipt #>> '{relationship,capabilities,canViewProfile}')::boolean from block_ab), false, 'block revokes profile visibility');
select is((select (receipt #>> '{relationship,capabilities,canMessage}')::boolean from block_ab), false, 'block revokes message capability');
select is((select (receipt #>> '{relationship,capabilities,canInviteToSession}')::boolean from block_ab), false, 'block revokes session invite capability');
select is((select (receipt #>> '{relationship,capabilities,canViewPresence}')::boolean from block_ab), false, 'block prevents presence disclosure');
select is((select (receipt #>> '{relationship,version}')::integer from block_ab), 5, 'block advances relationship version once');

reset role;
select is(
  (select count(*)::integer from public.player_blocks_v2 where blocker_player_id = '21000000-0000-4000-8000-000000002401' and blocked_player_id = '21000000-0000-4000-8000-000000002402' and active),
  1,
  'canonical block row is authoritative'
);
select is(
  (select count(*)::integer from public.blocks where blocker_id = '01000000-0000-4000-8000-000000002401' and blocked_id = '01000000-0000-4000-8000-000000002402'),
  1,
  'legacy block is dual-written during shadow cutover'
);
select is(
  (select count(*)::integer from private.social_authority_metrics_v2 where metric_name = 'legacy_block_dual_write' and relationship_id = private.social_relationship_id_v2('21000000-0000-4000-8000-000000002401', '21000000-0000-4000-8000-000000002402')),
  1,
  'block dual-write parity is measured'
);
select is(
  (select payload #>> '{payload,reasonCode}' from private.outbox_events where event_type = 'player.blocked.v2' and aggregate_id = private.social_relationship_id_v2('21000000-0000-4000-8000-000000002401', '21000000-0000-4000-8000-000000002402')),
  'user_safety',
  'block event carries stable private reason code'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002402', true);
select is((public.get_relationship_v2('21000000-0000-4000-8000-000000002401') #>> '{block,targetBlocksViewer}')::boolean, true, 'opposite direction sees target-blocks-viewer authority');
select throws_like(
  $$select public.mute_player_v2(jsonb_build_object(
    'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:07:00.000Z', 'clientPlatform', 'android', 'clientVersion', '2.0.0', 'requestId', 'safety-mute-while-blocked'),
    'correlationId', '43000000-0000-4000-8000-000000002408',
    'expectedRelationshipVersion', 5,
    'idempotencyKey', 'safety.mute.blocked.1',
    'targetPlayerId', '21000000-0000-4000-8000-000000002401'
  ))$$,
  '%relationship_blocked%',
  'block override forbids mute mutation from either side'
);

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002401', true);
select throws_like(
  $$select public.block_player_v2(jsonb_build_object(
    'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:08:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-block-ab-again'),
    'correlationId', '43000000-0000-4000-8000-000000002409',
    'expectedRelationshipVersion', 5,
    'idempotencyKey', 'safety.block.ab.0002',
    'targetPlayerId', '21000000-0000-4000-8000-000000002402'
  ))$$,
  '%block_already_active%',
  'different command cannot duplicate active block'
);
create temporary table unblock_ab as
select public.unblock_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:09:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-unblock-ab'),
  'correlationId', '43000000-0000-4000-8000-000000002410',
  'expectedRelationshipVersion', 5,
  'idempotencyKey', 'safety.unblock.ab.001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002402'
)) as receipt;
select is((select (receipt #>> '{relationship,capabilities,blocked}')::boolean from unblock_ab), false, 'unblock removes directional override');
select is((select receipt #>> '{relationship,friendship,state}' from unblock_ab), 'removed', 'unblock never restores friendship automatically');
select is((select (receipt #>> '{relationship,capabilities,canMessage}')::boolean from unblock_ab), false, 'unblock does not infer messaging capability after friendship removal');

reset role;
select is(
  (select count(*)::integer from public.blocks where blocker_id = '01000000-0000-4000-8000-000000002401' and blocked_id = '01000000-0000-4000-8000-000000002402'),
  0,
  'unblock removes legacy shadow row'
);
select is(
  (select payload #>> '{payload,friendshipRestored}' from private.outbox_events where event_type = 'player.unblocked.v2' and aggregate_id = private.social_relationship_id_v2('21000000-0000-4000-8000-000000002401', '21000000-0000-4000-8000-000000002402')),
  'false',
  'unblock event explicitly denies automatic friendship restoration'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002401', true);
create temporary table request_ac as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:10:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-request-ac'),
  'correlationId', '43000000-0000-4000-8000-000000002411',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'safety.friend.ac.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002403'
)) as receipt;
create temporary table block_ac as
select public.block_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:11:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-block-ac'),
  'correlationId', '43000000-0000-4000-8000-000000002412',
  'expectedRelationshipVersion', 1,
  'idempotencyKey', 'safety.block.ac.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002403'
)) as receipt;
select is((select receipt #>> '{relationship,friendship,state}' from block_ac), 'none', 'block cancels pending friendship rather than preserving pending state');
select is((select receipt #>> '{relationship,friendship,requestState}' from block_ac), 'cancelled', 'block terminates pending request lifecycle');

create temporary table block_suspended_target as
select public.block_player_v2(jsonb_build_object(
  'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:12:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-block-suspended-target'),
  'correlationId', '43000000-0000-4000-8000-000000002413',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'safety.block.suspended',
  'targetPlayerId', '21000000-0000-4000-8000-000000002404'
)) as receipt;
select is((select (receipt #>> '{relationship,capabilities,blocked}')::boolean from block_suspended_target), true, 'active actor may block suspended target for safety cleanup');

select throws_like(
  $$select public.block_player_v2(jsonb_build_object(
    'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:13:00.000Z', 'clientPlatform', 'ios', 'clientVersion', '2.0.0', 'requestId', 'safety-block-self'),
    'correlationId', '43000000-0000-4000-8000-000000002414',
    'expectedRelationshipVersion', 0,
    'idempotencyKey', 'safety.block.self.001',
    'targetPlayerId', '21000000-0000-4000-8000-000000002401'
  ))$$,
  '%relationship_self_forbidden%',
  'cannot block self'
);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002404', true);
select throws_like(
  $$select public.block_player_v2(jsonb_build_object(
    'audit', jsonb_build_object('clientCreatedAt', '2026-07-14T13:14:00.000Z', 'clientPlatform', 'android', 'clientVersion', '2.0.0', 'requestId', 'safety-suspended-actor'),
    'correlationId', '43000000-0000-4000-8000-000000002415',
    'expectedRelationshipVersion', 0,
    'idempotencyKey', 'safety.block.actor.suspended',
    'targetPlayerId', '21000000-0000-4000-8000-000000002401'
  ))$$,
  '%relationship_player_not_active%',
  'suspended actor cannot create safety mutation'
);

select * from finish();
rollback;
