create extension if not exists pgtap with schema extensions;

begin;
select plan(17);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002701', 'authenticated', 'authenticated', 'rollback-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002702', 'authenticated', 'authenticated', 'rollback-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002703', 'authenticated', 'authenticated', 'rollback-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('01000000-0000-4000-8000-000000002701', 'Rollback A'),
  ('01000000-0000-4000-8000-000000002702', 'Rollback B'),
  ('01000000-0000-4000-8000-000000002703', 'Rollback C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002701', '01000000-0000-4000-8000-000000002701', '01000000-0000-4000-8000-000000002701', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002702', '01000000-0000-4000-8000-000000002702', '01000000-0000-4000-8000-000000002702', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002703', '01000000-0000-4000-8000-000000002703', '01000000-0000-4000-8000-000000002703', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002701', '21000000-0000-4000-8000-000000002701', '01000000-0000-4000-8000-000000002701', 1, now()),
  ('31000000-0000-4000-8000-000000002702', '21000000-0000-4000-8000-000000002702', '01000000-0000-4000-8000-000000002702', 1, now()),
  ('31000000-0000-4000-8000-000000002703', '21000000-0000-4000-8000-000000002703', '01000000-0000-4000-8000-000000002703', 1, now());

update private.social_authority_config_v2
set reads_enabled = true,
    writes_enabled = true,
    legacy_block_shadow_reads_enabled = true
where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002701', true);

create temporary table initial_request as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T17:00:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'rollback-request-ab'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002701',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'rollback.friend.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002702'
)) as receipt;

select is(
  (select receipt #>> '{relationship,friendship,label}' from initial_request),
  'pending_outgoing',
  'rollback fixture creates an authoritative pending friendship'
);

reset role;
select is(
  (select count(*)::integer from public.social_relationships_v2 where id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback fixture has one canonical relationship row'
);
select is(
  (select count(*)::integer from public.friendship_requests_v2 where relationship_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback fixture has one canonical request row'
);
select is(
  (select count(*)::integer from private.command_receipts_v1 where command_name = 'request_friendship_v2' and account_id = '01000000-0000-4000-8000-000000002701' and idempotency_key = 'rollback.friend.ab.0001'),
  1,
  'rollback fixture has one durable command receipt'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.requested.v2' and aggregate_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback fixture has one replayable source event'
);
select is(
  (select count(*)::integer from private.audit_logs where action = 'friendship.requested.v2' and target_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback fixture has one server audit record'
);

update private.social_authority_config_v2
set reads_enabled = false,
    writes_enabled = false,
    legacy_block_shadow_reads_enabled = true
where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002701', true);
select throws_like(
  $$select public.get_relationship_v2('21000000-0000-4000-8000-000000002702')$$,
  '%service_unavailable%',
  'rollback disables Core V2 relationship reads with a stable error'
);
select throws_like(
  $$select public.request_friendship_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T17:01:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'rollback-request-ac-disabled'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002702',
    'expectedRelationshipVersion', 0,
    'idempotencyKey', 'rollback.friend.ac.0001',
    'targetPlayerId', '21000000-0000-4000-8000-000000002703'
  ))$$,
  '%service_unavailable%',
  'rollback disables new Social mutations with a stable error'
);

reset role;
select is(
  (select count(*)::integer from public.social_relationships_v2 where id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback preserves canonical relationship history'
);
select is(
  (select count(*)::integer from public.friendship_requests_v2 where relationship_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback preserves friendship request history'
);
select is(
  (select count(*)::integer from private.command_receipts_v1 where command_name = 'request_friendship_v2' and account_id = '01000000-0000-4000-8000-000000002701' and idempotency_key = 'rollback.friend.ab.0001' and response is not null),
  1,
  'rollback preserves the completed command receipt'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'friendship.requested.v2' and aggregate_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback preserves replayable outbox history'
);
select is(
  (select count(*)::integer from private.audit_logs where action = 'friendship.requested.v2' and target_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback preserves Social audit history'
);

update private.social_authority_config_v2
set reads_enabled = true,
    writes_enabled = true
where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002701', true);
create temporary table replay_after_restore as
select public.request_friendship_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T17:00:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'rollback-request-ab'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002701',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'rollback.friend.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002702'
)) as receipt;
select is(
  (select (receipt ->> 'repeated')::boolean from replay_after_restore),
  true,
  're-enable returns the original durable command receipt'
);
select is(
  (select receipt -> 'eventIds' from replay_after_restore),
  (select receipt -> 'eventIds' from initial_request),
  're-enable replay preserves the original event identity'
);
select is(
  public.get_relationship_v2('21000000-0000-4000-8000-000000002702') #>> '{friendship,label}',
  'pending_outgoing',
  're-enable restores authoritative reads without rewriting state'
);

reset role;
select is(
  (select count(*)::integer from public.friendship_requests_v2 where relationship_id = private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002701',
    '21000000-0000-4000-8000-000000002702'
  )),
  1,
  'rollback and replay never duplicate the friendship request'
);

select * from finish();
rollback;
