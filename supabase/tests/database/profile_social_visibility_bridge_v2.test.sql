create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002621', 'authenticated', 'authenticated', 'profile-visibility-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002622', 'authenticated', 'authenticated', 'profile-visibility-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002623', 'authenticated', 'authenticated', 'profile-visibility-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('01000000-0000-4000-8000-000000002621', 'Visibility A'),
  ('01000000-0000-4000-8000-000000002622', 'Visibility B'),
  ('01000000-0000-4000-8000-000000002623', 'Visibility C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002621', '01000000-0000-4000-8000-000000002621', '01000000-0000-4000-8000-000000002621', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002622', '01000000-0000-4000-8000-000000002622', '01000000-0000-4000-8000-000000002622', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002623', '01000000-0000-4000-8000-000000002623', '01000000-0000-4000-8000-000000002623', 'suspended', 2, false, false);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002621', '21000000-0000-4000-8000-000000002621', '01000000-0000-4000-8000-000000002621', 1, now()),
  ('31000000-0000-4000-8000-000000002622', '21000000-0000-4000-8000-000000002622', '01000000-0000-4000-8000-000000002622', 1, now()),
  ('31000000-0000-4000-8000-000000002623', '21000000-0000-4000-8000-000000002623', '01000000-0000-4000-8000-000000002623', 1, now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002621', true);

select is(
  public.resolve_visible_profile_identity_v2(
    '21000000-0000-4000-8000-000000002622'
  ) ->> 'legacyProfileId',
  '01000000-0000-4000-8000-000000002622',
  'active stranger resolves an everyone-visible profile through PlayerId'
);
select is(
  (select count(*)::integer from public.profiles where id = '01000000-0000-4000-8000-000000002622'),
  1,
  'profile RLS allows the same visible target'
);
select is(
  public.resolve_visible_profile_identity_v2() ->> 'profileId',
  '31000000-0000-4000-8000-000000002621',
  'self profile resolution preserves canonical ProfileId'
);
select is(
  (
    select count(*)::integer
    from public.player_profiles_v1
    where player_id = '21000000-0000-4000-8000-000000002622'
  ),
  0,
  'authenticated clients still cannot read cross-account identity mappings directly'
);

reset role;
update public.player_privacy_settings_v2
set profile_visibility = 'private', version = version + 1
where player_id = '21000000-0000-4000-8000-000000002622';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002621', true);
select throws_like(
  $$select public.resolve_visible_profile_identity_v2('21000000-0000-4000-8000-000000002622')$$,
  '%profile_visibility_denied%',
  'private profile is not resolved for a stranger'
);
select is(
  (select count(*)::integer from public.profiles where id = '01000000-0000-4000-8000-000000002622'),
  0,
  'direct legacy profile reads cannot bypass private visibility'
);
select throws_like(
  $$select public.resolve_visible_profile_identity_v2('21000000-0000-4000-8000-000000002623')$$,
  '%profile_visibility_denied%',
  'suspended target fails closed for profile resolution'
);

reset role;
update public.player_privacy_settings_v2
set profile_visibility = 'everyone', version = version + 1
where player_id = '21000000-0000-4000-8000-000000002622';
insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, version
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002621',
    '21000000-0000-4000-8000-000000002622'
  ),
  '21000000-0000-4000-8000-000000002621',
  '21000000-0000-4000-8000-000000002622',
  1
);
insert into public.player_blocks_v2 (
  relationship_id, blocker_player_id, blocked_player_id, active, version
) values (
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000002621',
    '21000000-0000-4000-8000-000000002622'
  ),
  '21000000-0000-4000-8000-000000002621',
  '21000000-0000-4000-8000-000000002622',
  true,
  1
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002621', true);
select throws_like(
  $$select public.resolve_visible_profile_identity_v2('21000000-0000-4000-8000-000000002622')$$,
  '%profile_visibility_denied%',
  'block override revokes profile identity resolution'
);
select is(
  (select count(*)::integer from public.profiles where id = '01000000-0000-4000-8000-000000002622'),
  0,
  'block override also revokes legacy profile RLS visibility'
);

select * from finish();
rollback;
