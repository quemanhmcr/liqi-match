create extension if not exists pgtap with schema extensions;

begin;

select plan(7);

select isnt(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'are_profiles_blocked',
        'is_conversation_member',
        'is_conversation_member_for_media'
      )
  ),
  true,
  'policy helpers are not exposed from public schema'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'private')
      and not ('search_path=""' = any(coalesce(p.proconfig, '{}')))
  ),
  0,
  'all security definer functions have fixed empty search_path'
);

select isnt(
  has_function_privilege('anon', 'public.record_swipe(uuid, public.swipe_direction)', 'EXECUTE'),
  true,
  'anon cannot execute record_swipe'
);

select ok(
  has_function_privilege('authenticated', 'public.record_swipe(uuid, public.swipe_direction)', 'EXECUTE'),
  'authenticated can execute record_swipe'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.swipes'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.swipes'::regclass and attname = 'actor_id'),
        (select attnum from pg_attribute where attrelid = 'public.swipes'::regclass and attname = 'target_id')
      ]::smallint[]
  ),
  'swipes are unique by actor and target'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matches'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.matches'::regclass and attname = 'profile_low_id'),
        (select attnum from pg_attribute where attrelid = 'public.matches'::regclass and attname = 'profile_high_id')
      ]::smallint[]
  ),
  'matches are unique by profile pair'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.conversations'::regclass and attname = 'match_id')
      ]::smallint[]
  ),
  'conversations are unique by match'
);

select * from finish();

rollback;
