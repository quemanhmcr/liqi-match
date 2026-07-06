create extension if not exists pgtap with schema extensions;

begin;

select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000201',
  'authenticated',
  'authenticated',
  'onboarding@example.test',
  'x',
  now(),
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);

select lives_ok(
  $$select * from public.complete_onboarding(
    '{
      "display_name": "Match Tester",
      "handle": "Match Tester",
      "locale": "vi",
      "timezone": "Asia/Bangkok",
      "rank_slug": "master",
      "role_slugs": ["jungle", "support"],
      "heroes": [
        {"slug": "edras", "name": "Edras", "role_slug": "fighter"},
        {"slug": "goverra", "name": "Goverra", "role_slug": "mage"},
        {"slug": "heino", "name": "Heino", "role_slug": "mage"}
      ],
      "availability_slots": [
        {"day_of_week": 1, "starts_at": "18:00:00", "ends_at": "23:59:00"},
        {"day_of_week": 2, "starts_at": "18:00:00", "ends_at": "23:59:00"}
      ],
      "regions": ["global"],
      "languages": ["vi"],
      "habits": {
        "communication_channels": ["Voice khi cần", "Ping/chat là chính"],
        "online_time_presets": ["Tối"],
        "decision_style": "Cùng trao đổi trước khi quyết định",
        "session_length": "3-5 trận",
        "team_goals": ["Leo rank nghiêm túc", "Tìm người phối hợp ổn định"],
        "seriousness": "Cân bằng",
        "strategy_styles": ["Ưu tiên kiểm soát mục tiêu"],
        "team_atmospheres": ["Nghiêm túc nhưng tôn trọng"],
        "feedback_style": "Chỉ nhắc ngắn gọn trong trận",
        "loss_response": "Nghỉ 5-15 phút",
        "comeback_response": "Theo quyết định chung của đội"
      },
      "media_summary": {"avatar": false, "cover": false, "wall_count": 0}
    }'::jsonb
  )$$,
  'authenticated user can complete onboarding through RPC'
);

reset role;

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000201'),
  'Match Tester',
  'profile is created'
);

select is(
  (select handle from public.game_profiles where profile_id = '00000000-0000-0000-0000-000000000201'),
  'Match Tester',
  'game profile is created'
);

select is(
  (select count(*)::integer from public.profile_roles where profile_id = '00000000-0000-0000-0000-000000000201'),
  2,
  'selected lanes are saved'
);

select is(
  (select count(*)::integer from public.profile_heroes where profile_id = '00000000-0000-0000-0000-000000000201'),
  3,
  'selected heroes are saved'
);

select is(
  (select count(*)::integer from public.availability_slots where profile_id = '00000000-0000-0000-0000-000000000201'),
  2,
  'availability slots are saved'
);

select is(
  (select seriousness from public.profile_habits where profile_id = '00000000-0000-0000-0000-000000000201'),
  'Cân bằng',
  'habit profile is saved'
);

select isnt(
  has_function_privilege('anon', 'public.complete_onboarding(jsonb)', 'EXECUTE'),
  true,
  'anon cannot execute complete_onboarding'
);

select ok(
  has_table_privilege('authenticated', 'public.profile_habits', 'SELECT'),
  'authenticated can read own profile habits completion marker'
);

select isnt(
  has_table_privilege('anon', 'public.profile_habits', 'SELECT'),
  true,
  'anon cannot read profile habits completion markers'
);

select * from finish();

rollback;
