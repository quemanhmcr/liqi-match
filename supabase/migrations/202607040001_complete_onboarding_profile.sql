insert into public.ranks (slug, name, sort_order)
values
  ('iron', 'Sắt', 10),
  ('bronze', 'Đồng', 20),
  ('silver', 'Bạc', 30),
  ('gold', 'Vàng', 40),
  ('platinum', 'Bạch Kim', 50),
  ('diamond', 'Kim Cương', 60),
  ('veteran', 'Tinh Anh', 65),
  ('master', 'Cao Thủ', 70),
  ('grandmaster_iv', 'Đại Cao Thủ IV', 80),
  ('grandmaster_iii', 'Đại Cao Thủ III', 90),
  ('grandmaster_ii', 'Đại Cao Thủ II', 100),
  ('grandmaster_i', 'Đại Cao Thủ I', 110),
  ('conqueror', 'Chiến Tướng', 120),
  ('legendary', 'Chiến Thần', 130)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;

insert into public.roles (slug, name)
values
  ('slayer', 'Đường Tà Thần'),
  ('jungle', 'Đi Rừng'),
  ('mid', 'Đường Giữa'),
  ('dragon', 'Đường Rồng'),
  ('support', 'Trợ Thủ'),
  ('fighter', 'Đấu sĩ'),
  ('tank', 'Đỡ đòn'),
  ('mage', 'Pháp sư'),
  ('assassin', 'Sát thủ'),
  ('marksman', 'Xạ thủ')
on conflict (slug) do update
  set name = excluded.name;

create table public.profile_habits (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  communication_channels text[] not null default '{}',
  online_time_presets text[] not null default '{}',
  decision_style text not null,
  session_length text not null,
  team_goals text[] not null default '{}',
  seriousness text not null,
  strategy_styles text[] not null default '{}',
  team_atmospheres text[] not null default '{}',
  feedback_style text not null,
  loss_response text not null,
  comeback_response text not null,
  media_summary jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_habits_set_updated_at
before update on public.profile_habits
for each row execute function public.set_updated_at();

alter table public.profile_habits enable row level security;

drop policy if exists "Users manage own profile habits" on public.profile_habits;
create policy "Users manage own profile habits"
on public.profile_habits for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.complete_onboarding(payload jsonb)
returns table(profile_id uuid, completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := auth.uid();
  display_name_value text := nullif(btrim(payload->>'display_name'), '');
  handle_value text := nullif(btrim(payload->>'handle'), '');
  locale_value text := coalesce(nullif(btrim(payload->>'locale'), ''), 'vi');
  timezone_value text := coalesce(nullif(btrim(payload->>'timezone'), ''), 'UTC');
  rank_slug_value text := nullif(btrim(payload->>'rank_slug'), '');
  selected_rank_id uuid;
  selected_role_slugs text[] := array[]::text[];
  regions_value text[] := array[]::text[];
  languages_value text[] := array[]::text[];
  habits jsonb := coalesce(payload->'habits', '{}'::jsonb);
  communication_channels_value text[] := array[]::text[];
  online_time_presets_value text[] := array[]::text[];
  team_goals_value text[] := array[]::text[];
  strategy_styles_value text[] := array[]::text[];
  team_atmospheres_value text[] := array[]::text[];
  decision_style_value text := nullif(btrim(habits->>'decision_style'), '');
  session_length_value text := nullif(btrim(habits->>'session_length'), '');
  seriousness_value text := nullif(btrim(habits->>'seriousness'), '');
  feedback_style_value text := nullif(btrim(habits->>'feedback_style'), '');
  loss_response_value text := nullif(btrim(habits->>'loss_response'), '');
  comeback_response_value text := nullif(btrim(habits->>'comeback_response'), '');
  expected_role_count integer;
  inserted_role_count integer;
  expected_hero_count integer;
  inserted_hero_count integer := 0;
  hero_record record;
  hero_role_id uuid;
  saved_hero_id uuid;
begin
  if actor_profile_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if display_name_value is null or char_length(display_name_value) not between 2 and 40 then
    raise exception 'display_name must be between 2 and 40 characters' using errcode = '22023';
  end if;

  if handle_value is null then
    handle_value := display_name_value;
  end if;

  if char_length(handle_value) not between 2 and 64 then
    raise exception 'handle must be between 2 and 64 characters' using errcode = '22023';
  end if;

  select id into selected_rank_id
  from public.ranks
  where slug = rank_slug_value;

  if selected_rank_id is null then
    raise exception 'Unknown rank_slug: %', rank_slug_value using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct role_value.value), array[]::text[])
  into selected_role_slugs
  from jsonb_array_elements_text(coalesce(payload->'role_slugs', '[]'::jsonb)) as role_value(value);

  expected_role_count := cardinality(selected_role_slugs);
  if expected_role_count < 1 or expected_role_count > 2 then
    raise exception 'role_slugs must contain 1 or 2 values' using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(coalesce(payload->'heroes', '[]'::jsonb)), 0) <> 3 then
    raise exception 'heroes must contain exactly 3 values' using errcode = '22023';
  end if;

  select coalesce(array_agg(region_value.value), array[]::text[])
  into regions_value
  from jsonb_array_elements_text(coalesce(payload->'regions', '[]'::jsonb)) as region_value(value);

  select coalesce(array_agg(language_value.value), array[]::text[])
  into languages_value
  from jsonb_array_elements_text(coalesce(payload->'languages', '[]'::jsonb)) as language_value(value);

  select coalesce(array_agg(channel_value.value), array[]::text[])
  into communication_channels_value
  from jsonb_array_elements_text(coalesce(habits->'communication_channels', '[]'::jsonb)) as channel_value(value);

  select coalesce(array_agg(time_value.value), array[]::text[])
  into online_time_presets_value
  from jsonb_array_elements_text(coalesce(habits->'online_time_presets', '[]'::jsonb)) as time_value(value);

  select coalesce(array_agg(goal_value.value), array[]::text[])
  into team_goals_value
  from jsonb_array_elements_text(coalesce(habits->'team_goals', '[]'::jsonb)) as goal_value(value);

  select coalesce(array_agg(strategy_value.value), array[]::text[])
  into strategy_styles_value
  from jsonb_array_elements_text(coalesce(habits->'strategy_styles', '[]'::jsonb)) as strategy_value(value);

  select coalesce(array_agg(atmosphere_value.value), array[]::text[])
  into team_atmospheres_value
  from jsonb_array_elements_text(coalesce(habits->'team_atmospheres', '[]'::jsonb)) as atmosphere_value(value);

  if cardinality(communication_channels_value) = 0
    or cardinality(online_time_presets_value) = 0
    or decision_style_value is null
    or session_length_value is null
    or cardinality(team_goals_value) = 0
    or seriousness_value is null
    or feedback_style_value is null
    or loss_response_value is null
    or comeback_response_value is null then
    raise exception 'Incomplete onboarding habits payload' using errcode = '22023';
  end if;

  insert into public.profiles (
    id,
    display_name,
    locale,
    timezone,
    is_discoverable,
    deleted_at
  )
  values (
    actor_profile_id,
    display_name_value,
    locale_value,
    timezone_value,
    true,
    null
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        locale = excluded.locale,
        timezone = excluded.timezone,
        is_discoverable = true,
        deleted_at = null;

  insert into public.game_profiles (profile_id, rank_id, handle, server_region)
  values (actor_profile_id, selected_rank_id, handle_value, coalesce(regions_value[1], 'global'))
  on conflict (profile_id) do update
    set rank_id = excluded.rank_id,
        handle = excluded.handle,
        server_region = excluded.server_region;

  delete from public.profile_roles where profile_id = actor_profile_id;

  insert into public.profile_roles (profile_id, role_id)
  select actor_profile_id, roles.id
  from public.roles
  where roles.slug = any(selected_role_slugs);

  get diagnostics inserted_role_count = row_count;
  if inserted_role_count <> expected_role_count then
    raise exception 'Unknown role_slug in payload' using errcode = '22023';
  end if;

  delete from public.profile_heroes where profile_id = actor_profile_id;

  for hero_record in
    select *
    from jsonb_to_recordset(payload->'heroes')
      as hero(slug text, name text, role_slug text)
  loop
    if hero_record.slug is null
      or hero_record.name is null
      or hero_record.role_slug is null
      or hero_record.slug !~ '^[a-z0-9_]+$'
      or char_length(hero_record.name) < 1 then
      raise exception 'Invalid hero payload' using errcode = '22023';
    end if;

    select id into hero_role_id
    from public.roles
    where slug = hero_record.role_slug;

    if hero_role_id is null then
      raise exception 'Unknown hero role_slug: %', hero_record.role_slug using errcode = '22023';
    end if;

    insert into public.heroes (slug, name, role_id)
    values (hero_record.slug, hero_record.name, hero_role_id)
    on conflict (slug) do update
      set name = excluded.name,
          role_id = excluded.role_id
    returning id into saved_hero_id;

    insert into public.profile_heroes (profile_id, hero_id)
    values (actor_profile_id, saved_hero_id)
    on conflict do nothing;

    inserted_hero_count := inserted_hero_count + 1;
  end loop;

  expected_hero_count := 3;
  if inserted_hero_count <> expected_hero_count then
    raise exception 'Expected exactly 3 heroes' using errcode = '22023';
  end if;

  delete from public.availability_slots where profile_id = actor_profile_id;

  insert into public.availability_slots (profile_id, day_of_week, starts_at, ends_at)
  select
    actor_profile_id,
    (slot.value->>'day_of_week')::smallint,
    (slot.value->>'starts_at')::time,
    (slot.value->>'ends_at')::time
  from jsonb_array_elements(coalesce(payload->'availability_slots', '[]'::jsonb)) as slot(value);

  insert into public.match_preferences (profile_id, regions, languages)
  values (
    actor_profile_id,
    coalesce(nullif(regions_value, array[]::text[]), array['global']),
    coalesce(nullif(languages_value, array[]::text[]), array['vi'])
  )
  on conflict (profile_id) do update
    set regions = excluded.regions,
        languages = excluded.languages;

  insert into public.profile_habits (
    profile_id,
    communication_channels,
    online_time_presets,
    decision_style,
    session_length,
    team_goals,
    seriousness,
    strategy_styles,
    team_atmospheres,
    feedback_style,
    loss_response,
    comeback_response,
    media_summary
  )
  values (
    actor_profile_id,
    communication_channels_value,
    online_time_presets_value,
    decision_style_value,
    session_length_value,
    team_goals_value,
    seriousness_value,
    strategy_styles_value,
    team_atmospheres_value,
    feedback_style_value,
    loss_response_value,
    comeback_response_value,
    coalesce(payload->'media_summary', '{}'::jsonb)
  )
  on conflict (profile_id) do update
    set communication_channels = excluded.communication_channels,
        online_time_presets = excluded.online_time_presets,
        decision_style = excluded.decision_style,
        session_length = excluded.session_length,
        team_goals = excluded.team_goals,
        seriousness = excluded.seriousness,
        strategy_styles = excluded.strategy_styles,
        team_atmospheres = excluded.team_atmospheres,
        feedback_style = excluded.feedback_style,
        loss_response = excluded.loss_response,
        comeback_response = excluded.comeback_response,
        media_summary = excluded.media_summary;

  return query select actor_profile_id, true;
end;
$$;

revoke execute on function public.complete_onboarding(jsonb) from public, anon;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
