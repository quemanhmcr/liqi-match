create extension if not exists pgtap with schema extensions;

begin;

select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000001', 'Player A'),
  ('00000000-0000-0000-0000-000000000002', 'Player B'),
  ('00000000-0000-0000-0000-000000000003', 'Player C');

insert into public.media_assets (
  id,
  owner_id,
  purpose,
  object_key,
  mime_type,
  byte_size,
  visibility,
  status,
  moderation_status
)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'personal_avatar',
  'personal_avatar/00000000-0000-0000-0000-000000000002/test.png',
  'image/png',
  128,
  'public',
  'ready',
  'approved'
);

insert into public.matches (id, profile_low_id, profile_high_id)
values (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

insert into public.conversations (id, match_id)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001'
);

insert into public.conversation_members (conversation_id, profile_id)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

insert into public.messages (conversation_id, sender_id, body)
values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'hello'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.messages),
  1,
  'conversation member can read messages'
);

select throws_ok(
  $$insert into public.matches (profile_low_id, profile_high_id)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')$$,
  '42501',
  null,
  'client cannot directly create matches'
);

delete from public.media_assets
where id = '10000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::integer from public.media_assets where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'client cannot delete media directly'
);

select lives_ok(
  $$select * from public.record_swipe('00000000-0000-0000-0000-000000000003', 'like')$$,
  'authenticated user can swipe through RPC'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::integer from public.messages),
  0,
  'non-member cannot read messages'
);

select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'nope')$$,
  '42501',
  null,
  'non-member cannot send messages'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000003'),
  0,
  'blocked users are not discoverable'
);

select throws_ok(
  $$select * from public.record_swipe('00000000-0000-0000-0000-000000000003', 'like')$$,
  '42501',
  null,
  'blocked users cannot be swiped'
);

select * from finish();

rollback;
