create extension if not exists pgtap with schema extensions;

begin;

select plan(20);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002101', 'authenticated', 'authenticated', 'social-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002102', 'authenticated', 'authenticated', 'social-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002103', 'authenticated', 'authenticated', 'social-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000002101', 'Social A'),
  ('01000000-0000-4000-8000-000000002102', 'Social B'),
  ('01000000-0000-4000-8000-000000002103', 'Social C');

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002101', '01000000-0000-4000-8000-000000002101', '01000000-0000-4000-8000-000000002101', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002102', '01000000-0000-4000-8000-000000002102', '01000000-0000-4000-8000-000000002102', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002103', '01000000-0000-4000-8000-000000002103', '01000000-0000-4000-8000-000000002103', 'suspended', 2, false, false);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002101', '21000000-0000-4000-8000-000000002101', '01000000-0000-4000-8000-000000002101', 1, now()),
  ('31000000-0000-4000-8000-000000002102', '21000000-0000-4000-8000-000000002102', '01000000-0000-4000-8000-000000002102', 1, now()),
  ('31000000-0000-4000-8000-000000002103', '21000000-0000-4000-8000-000000002103', '01000000-0000-4000-8000-000000002103', 1, now());

select is(
  (select count(*)::integer from public.player_privacy_settings_v2 where player_id in (
    '21000000-0000-4000-8000-000000002101',
    '21000000-0000-4000-8000-000000002102',
    '21000000-0000-4000-8000-000000002103'
  )),
  3,
  'new canonical players receive one privacy aggregate each'
);

select is(
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002101',
    '21000000-0000-4000-8000-000000002102'
  ),
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002102',
    '21000000-0000-4000-8000-000000002101'
  ),
  'relationship identity is deterministic for either pair direction'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002101', true);

create temporary table default_relationship as
select public.get_relationship_v2(
  '21000000-0000-4000-8000-000000002102'
) as snapshot;

select is(
  (select (snapshot ->> 'contractVersion')::integer from default_relationship),
  2,
  'relationship read returns the exact Core V2 contract version'
);
select is(
  (select (snapshot ->> 'version')::integer from default_relationship),
  0,
  'missing pair state is represented as aggregate version zero'
);
select is(
  (select snapshot #>> '{friendship,label}' from default_relationship),
  'none',
  'missing relationship is not inferred as friend'
);
select is(
  (select (snapshot #>> '{capabilities,canRequestFriendship}')::boolean from default_relationship),
  true,
  'active strangers may request friendship under default privacy'
);
select is(
  (select (snapshot #>> '{capabilities,canMessage}')::boolean from default_relationship),
  false,
  'strangers do not receive message capability from the client'
);
select is(
  (select (snapshot #>> '{capabilities,canViewProfile}')::boolean from default_relationship),
  true,
  'default profile privacy is visible to active strangers'
);
select is(
  (select (snapshot #>> '{capabilities,canViewPresence}')::boolean from default_relationship),
  false,
  'default presence privacy does not leak to strangers'
);
select is(
  (public.list_friendships_v2() -> 'items'),
  '[]'::jsonb,
  'friend list does not infer friendship from missing state'
);

select throws_like(
  $$select public.get_relationship_v2('21000000-0000-4000-8000-000000002101')$$,
  '%relationship_self_forbidden%',
  'self relationship reads are rejected'
);
select throws_like(
  $$select * from public.social_relationships_v2$$,
  '%permission denied%',
  'authenticated clients cannot bypass relationship RPC authority'
);
select throws_like(
  $$select * from public.player_blocks_v2$$,
  '%permission denied%',
  'authenticated clients cannot inspect another account block rows'
);

reset role;
insert into public.blocks (blocker_id, blocked_id, reason)
values (
  '01000000-0000-4000-8000-000000002101',
  '01000000-0000-4000-8000-000000002102',
  'legacy-shadow-test'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002101', true);

create temporary table blocked_relationship as
select public.get_relationship_v2(
  '21000000-0000-4000-8000-000000002102'
) as snapshot;
select is(
  (select (snapshot #>> '{capabilities,blocked}')::boolean from blocked_relationship),
  true,
  'legacy block remains authoritative during shadow-read cutover'
);
select is(
  (select (snapshot #>> '{capabilities,canDiscover}')::boolean from blocked_relationship),
  false,
  'block override removes discovery capability'
);
select is(
  (select (snapshot #>> '{capabilities,canMessage}')::boolean from blocked_relationship),
  false,
  'block override removes message capability'
);
select is(
  (select (snapshot #>> '{capabilities,canInviteToSession}')::boolean from blocked_relationship),
  false,
  'block override removes session invitation capability'
);
select is(
  (select (snapshot #>> '{capabilities,canViewPresence}')::boolean from blocked_relationship),
  false,
  'block override prevents presence disclosure'
);

create temporary table suspended_relationship as
select public.get_relationship_v2(
  '21000000-0000-4000-8000-000000002103'
) as snapshot;
select is(
  (select (snapshot #>> '{capabilities,canViewProfile}')::boolean from suspended_relationship),
  false,
  'suspended target lifecycle fails closed for profile visibility'
);
select is(
  (select (snapshot #>> '{capabilities,canRequestFriendship}')::boolean from suspended_relationship),
  false,
  'suspended target lifecycle cannot receive relationship mutations'
);

select * from finish();
rollback;
