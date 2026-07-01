create extension if not exists pgtap with schema extensions;

begin;

select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'match-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'match-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000101', 'Match A'),
  ('00000000-0000-0000-0000-000000000102', 'Match B');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select * from public.record_swipe('00000000-0000-0000-0000-000000000102', 'like');
select * from public.record_swipe('00000000-0000-0000-0000-000000000102', 'like');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select * from public.record_swipe('00000000-0000-0000-0000-000000000101', 'like');
select * from public.record_swipe('00000000-0000-0000-0000-000000000101', 'like');

reset role;

select is(
  (select count(*)::integer from public.swipes),
  2,
  'retrying swipes keeps exactly one swipe per direction'
);

select is(
  (select count(*)::integer from public.matches),
  1,
  'retrying reverse swipes creates exactly one match'
);

select is(
  (select count(*)::integer from public.conversations),
  1,
  'retrying reverse swipes creates exactly one conversation'
);

select is(
  (select count(*)::integer from public.conversation_members),
  2,
  'retrying reverse swipes creates exactly two conversation members'
);

select * from finish();

rollback;
