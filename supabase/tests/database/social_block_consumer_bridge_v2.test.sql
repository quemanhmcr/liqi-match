create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000581', 'authenticated', 'authenticated', 'bridge-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000582', 'authenticated', 'authenticated', 'bridge-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000583', 'authenticated', 'authenticated', 'bridge-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000581', 'Bridge A'),
  ('00000000-0000-0000-0000-000000000582', 'Bridge B'),
  ('00000000-0000-0000-0000-000000000583', 'Bridge C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000581', '00000000-0000-0000-0000-000000000581', '00000000-0000-0000-0000-000000000581', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000582', '00000000-0000-0000-0000-000000000582', '00000000-0000-0000-0000-000000000582', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000583', '00000000-0000-0000-0000-000000000583', '00000000-0000-0000-0000-000000000583', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000581', '20000000-0000-4000-8000-000000000581', '00000000-0000-0000-0000-000000000581', 1, now()),
  ('30000000-0000-4000-8000-000000000582', '20000000-0000-4000-8000-000000000582', '00000000-0000-0000-0000-000000000582', 1, now()),
  ('30000000-0000-4000-8000-000000000583', '20000000-0000-4000-8000-000000000583', '00000000-0000-0000-0000-000000000583', 1, now());

insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, version
) values (
  private.social_relationship_id_v2(
    '20000000-0000-4000-8000-000000000581',
    '20000000-0000-4000-8000-000000000582'
  ),
  '20000000-0000-4000-8000-000000000581',
  '20000000-0000-4000-8000-000000000582',
  1
);

insert into public.player_blocks_v2 (
  relationship_id, blocker_player_id, blocked_player_id, active, version
) values (
  private.social_relationship_id_v2(
    '20000000-0000-4000-8000-000000000581',
    '20000000-0000-4000-8000-000000000582'
  ),
  '20000000-0000-4000-8000-000000000581',
  '20000000-0000-4000-8000-000000000582',
  true,
  1
);

select ok(
  private.are_profiles_blocked(
    '00000000-0000-0000-0000-000000000581',
    '00000000-0000-0000-0000-000000000582'
  ),
  'legacy-profile consumers observe a V2-only block'
);
select ok(
  private.are_profiles_blocked(
    '00000000-0000-0000-0000-000000000582',
    '00000000-0000-0000-0000-000000000581'
  ),
  'block override is symmetric for consumer eligibility checks'
);
select isnt(
  private.are_profiles_blocked(
    '00000000-0000-0000-0000-000000000581',
    '00000000-0000-0000-0000-000000000583'
  ),
  true,
  'unrelated players are not blocked'
);

update public.player_blocks_v2
set active = false, unblocked_at = now(), version = version + 1
where blocker_player_id = '20000000-0000-4000-8000-000000000581'
  and blocked_player_id = '20000000-0000-4000-8000-000000000582';
select isnt(
  private.are_profiles_blocked(
    '00000000-0000-0000-0000-000000000581',
    '00000000-0000-0000-0000-000000000582'
  ),
  true,
  'inactive V2 block no longer revokes consumer capability'
);

insert into public.blocks (blocker_id, blocked_id, reason) values (
  '00000000-0000-0000-0000-000000000581',
  '00000000-0000-0000-0000-000000000583',
  'shadow-test'
);
select ok(
  private.are_profiles_blocked(
    '00000000-0000-0000-0000-000000000581',
    '00000000-0000-0000-0000-000000000583'
  ),
  'legacy shadow read remains available during parity rollout'
);

update private.social_authority_config_v2
set legacy_block_shadow_reads_enabled = false
where singleton;
select isnt(
  private.are_profiles_blocked(
    '00000000-0000-0000-0000-000000000581',
    '00000000-0000-0000-0000-000000000583'
  ),
  true,
  'kill switch removes legacy block semantics after cutover'
);
select ok(
  has_function_privilege(
    'authenticated',
    'private.are_profiles_blocked(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated policy consumers retain helper execution'
);
select isnt(
  has_table_privilege('authenticated', 'public.player_blocks_v2', 'SELECT'),
  true,
  'mobile clients cannot bypass the provider with direct block reads'
);

select * from finish();
rollback;
