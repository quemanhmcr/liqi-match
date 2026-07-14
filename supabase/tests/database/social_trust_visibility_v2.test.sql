create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002201', 'authenticated', 'authenticated', 'trust-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002202', 'authenticated', 'authenticated', 'trust-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002203', 'authenticated', 'authenticated', 'trust-c@example.test', 'x', now(), now(), now());
insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000002201', 'Trust A'),
  ('01000000-0000-4000-8000-000000002202', 'Trust B'),
  ('01000000-0000-4000-8000-000000002203', 'Trust C');
insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002201', '01000000-0000-4000-8000-000000002201', '01000000-0000-4000-8000-000000002201', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002202', '01000000-0000-4000-8000-000000002202', '01000000-0000-4000-8000-000000002202', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002203', '01000000-0000-4000-8000-000000002203', '01000000-0000-4000-8000-000000002203', 'suspended', 2, false, false);
insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002201', '21000000-0000-4000-8000-000000002201', '01000000-0000-4000-8000-000000002201', 1, now()),
  ('31000000-0000-4000-8000-000000002202', '21000000-0000-4000-8000-000000002202', '01000000-0000-4000-8000-000000002202', 1, now()),
  ('31000000-0000-4000-8000-000000002203', '21000000-0000-4000-8000-000000002203', '01000000-0000-4000-8000-000000002203', 1, now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002201', true);

select is(
  public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002202') ->> 'trustVisibility',
  'friends',
  'trust projection visibility defaults to friends rather than public'
);
select is(
  (public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002202') ->> 'canViewTrust')::boolean,
  false,
  'strangers cannot read trust projection under friends visibility'
);

reset role;
create temporary table trust_relationship as
select private.ensure_social_relationship_v2(
  '21000000-0000-4000-8000-000000002201',
  '21000000-0000-4000-8000-000000002202'
) as relationship;
update public.social_relationships_v2
set friendship_state = 'accepted',
    accepted_at = now(),
    version = 1
where id = private.social_relationship_id_v2(
  '21000000-0000-4000-8000-000000002201',
  '21000000-0000-4000-8000-000000002202'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002201', true);
select is(
  (public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002202') ->> 'canViewTrust')::boolean,
  true,
  'accepted friendship grants trust projection under friends visibility'
);
select is(
  (public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002203') ->> 'canViewTrust')::boolean,
  false,
  'suspended target lifecycle fails closed for trust projection'
);

reset role;
insert into public.player_blocks_v2 (
  relationship_id,
  blocker_player_id,
  blocked_player_id,
  active,
  version,
  blocked_at
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002201',
    '21000000-0000-4000-8000-000000002202'
  ),
  '21000000-0000-4000-8000-000000002201',
  '21000000-0000-4000-8000-000000002202',
  true,
  1,
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002201', true);
select is(
  (public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002202') ->> 'blocked')::boolean,
  true,
  'trust decision consumes directional block authority'
);
select is(
  (public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002202') ->> 'canViewTrust')::boolean,
  false,
  'block override revokes trust projection visibility'
);
select throws_like(
  $$select public.get_trust_visibility_v2('21000000-0000-4000-8000-000000002201')$$,
  '%relationship_self_forbidden%',
  'cross-player trust provider rejects self-targeting'
);

select * from finish();
rollback;
