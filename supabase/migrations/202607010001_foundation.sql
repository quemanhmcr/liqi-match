create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

create type public.media_purpose as enum (
  'game_profile',
  'personal_avatar',
  'chat_attachment',
  'report_evidence'
);

create type public.media_visibility as enum (
  'public',
  'matched_users',
  'conversation_members',
  'moderators_only'
);

create type public.media_status as enum (
  'pending',
  'uploaded',
  'ready',
  'rejected',
  'delete_pending',
  'deleted'
);

create type public.media_moderation_status as enum (
  'pending',
  'approved',
  'rejected',
  'review_required'
);

create type public.swipe_direction as enum ('pass', 'like');
create type private.outbox_status as enum ('pending', 'processing', 'processed', 'failed');

create table public.ranks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name text not null,
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.heroes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name text not null,
  role_id uuid references public.roles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_media_id uuid,
  bio text,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  is_discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.game_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  rank_id uuid references public.ranks(id) on delete set null,
  handle text not null check (char_length(handle) between 2 and 64),
  server_region text not null default 'global',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

create table public.profile_heroes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hero_id uuid not null references public.heroes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, hero_id)
);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.match_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  min_rank_id uuid references public.ranks(id) on delete set null,
  max_rank_id uuid references public.ranks(id) on delete set null,
  regions text[] not null default '{}',
  languages text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.swipes (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  direction public.swipe_direction not null,
  created_at timestamptz not null default now(),
  unique (actor_id, target_id),
  check (actor_id <> target_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  profile_low_id uuid not null references public.profiles(id) on delete cascade,
  profile_high_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unmatched_at timestamptz,
  unique (profile_low_id, profile_high_id),
  check (profile_low_id < profile_high_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid unique references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 80),
  details text,
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  purpose public.media_purpose not null,
  object_key text not null unique check (object_key !~ '(^/|\\.\\.|//)'),
  original_filename text,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  checksum text,
  visibility public.media_visibility not null,
  status public.media_status not null default 'pending',
  moderation_status public.media_moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.profiles
  add constraint profiles_avatar_media_id_fkey
  foreign key (avatar_media_id) references public.media_assets(id) on delete set null;

create table private.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table private.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table private.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'media_uploaded',
    'media_delete_requested',
    'media_processing_requested',
    'push_notification_requested',
    'account_deletion_requested'
  )),
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}',
  status private.outbox_status not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table private.idempotency_keys (
  scope text not null,
  key text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

create index media_assets_owner_status_idx on public.media_assets (owner_id, status);
create index media_assets_object_key_idx on public.media_assets (object_key);
create index outbox_events_pending_idx on private.outbox_events (status, available_at);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index swipes_target_actor_idx on public.swipes (target_id, actor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger game_profiles_set_updated_at
before update on public.game_profiles
for each row execute function public.set_updated_at();

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

create or replace function public.is_conversation_member(conversation_id uuid, profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = $1
      and cm.profile_id = $2
  );
$$;

create or replace function public.are_profiles_blocked(left_profile_id uuid, right_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = $1 and b.blocked_id = $2)
       or (b.blocker_id = $2 and b.blocked_id = $1)
  );
$$;

create or replace function public.is_conversation_member_for_media(media_asset_id uuid, profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.media_assets ma
    where ma.id = $1
      and ma.owner_id = $2
  )
  or exists (
    select 1
    from public.messages m
    where m.body like '%' || $1::text || '%'
      and public.is_conversation_member(m.conversation_id, $2)
  );
$$;

create or replace function public.record_swipe(target_profile_id uuid, direction public.swipe_direction)
returns table(match_id uuid, conversation_id uuid, matched boolean)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_profile_id uuid := auth.uid();
  low_id uuid;
  high_id uuid;
  created_match_id uuid;
  created_conversation_id uuid;
begin
  if actor_profile_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if actor_profile_id = target_profile_id then
    raise exception 'Cannot swipe yourself' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = actor_profile_id and deleted_at is null) then
    raise exception 'Actor profile not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where id = target_profile_id and deleted_at is null and is_discoverable) then
    raise exception 'Target profile not available' using errcode = 'P0002';
  end if;

  if public.are_profiles_blocked(actor_profile_id, target_profile_id) then
    raise exception 'Profiles are blocked' using errcode = '42501';
  end if;

  insert into public.swipes (actor_id, target_id, direction)
  values (actor_profile_id, target_profile_id, direction)
  on conflict (actor_id, target_id) do update
    set direction = excluded.direction,
        created_at = now();

  if direction = 'like' and exists (
    select 1
    from public.swipes
    where actor_id = target_profile_id
      and target_id = actor_profile_id
      and direction = 'like'
  ) then
    low_id := least(actor_profile_id, target_profile_id);
    high_id := greatest(actor_profile_id, target_profile_id);

    insert into public.matches (profile_low_id, profile_high_id)
    values (low_id, high_id)
    on conflict (profile_low_id, profile_high_id) do update
      set unmatched_at = null
    returning id into created_match_id;

    insert into public.conversations (match_id)
    values (created_match_id)
    on conflict (match_id) do update
      set match_id = excluded.match_id
    returning id into created_conversation_id;

    insert into public.conversation_members (conversation_id, profile_id)
    values
      (created_conversation_id, low_id),
      (created_conversation_id, high_id)
    on conflict do nothing;

    return query select created_match_id, created_conversation_id, true;
    return;
  end if;

  return query select null::uuid, null::uuid, false;
end;
$$;

create or replace function private.enqueue_outbox(
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = private
as $$
declare
  event_id uuid;
begin
  insert into private.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values (event_type, aggregate_type, aggregate_id, coalesce(payload, '{}'))
  returning id into event_id;

  return event_id;
end;
$$;

alter default privileges revoke execute on functions from public;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.record_swipe(uuid, public.swipe_direction) to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.are_profiles_blocked(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member_for_media(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.game_profiles enable row level security;
alter table public.ranks enable row level security;
alter table public.roles enable row level security;
alter table public.heroes enable row level security;
alter table public.profile_roles enable row level security;
alter table public.profile_heroes enable row level security;
alter table public.availability_slots enable row level security;
alter table public.match_preferences enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.media_assets enable row level security;

create policy "Reference ranks are readable"
on public.ranks for select
to anon, authenticated
using (true);

create policy "Reference roles are readable"
on public.roles for select
to anon, authenticated
using (true);

create policy "Reference heroes are readable"
on public.heroes for select
to anon, authenticated
using (true);

create policy "Profiles are readable when discoverable or own"
on public.profiles for select
to authenticated
using (
  deleted_at is null
  and (
    id = auth.uid()
    or (
      is_discoverable
      and not public.are_profiles_blocked(auth.uid(), id)
    )
  )
);

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can read own game profile and discoverable profiles"
on public.game_profiles for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = game_profiles.profile_id
      and p.deleted_at is null
      and p.is_discoverable
      and not public.are_profiles_blocked(auth.uid(), p.id)
  )
);

create policy "Users manage own game profile"
on public.game_profiles for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users manage own profile roles"
on public.profile_roles for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users manage own profile heroes"
on public.profile_heroes for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users manage own availability"
on public.availability_slots for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users manage own match preferences"
on public.match_preferences for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users can read own swipes only"
on public.swipes for select
to authenticated
using (actor_id = auth.uid());

create policy "Matched users can read matches"
on public.matches for select
to authenticated
using (auth.uid() in (profile_low_id, profile_high_id));

create policy "Conversation members can read conversations"
on public.conversations for select
to authenticated
using (public.is_conversation_member(id, auth.uid()));

create policy "Conversation members can read membership"
on public.conversation_members for select
to authenticated
using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "Conversation members can read messages"
on public.messages for select
to authenticated
using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "Conversation members can insert own messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(conversation_id, auth.uid())
);

create policy "Users can create own teams"
on public.teams for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Team members can read teams"
on public.teams for select
to authenticated
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = teams.id
      and tm.profile_id = auth.uid()
  )
);

create policy "Team owners can update teams"
on public.teams for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Team members can read members"
on public.team_members for select
to authenticated
using (
  exists (
    select 1 from public.team_members self_tm
    where self_tm.team_id = team_members.team_id
      and self_tm.profile_id = auth.uid()
  )
);

create policy "Users can block others"
on public.blocks for insert
to authenticated
with check (blocker_id = auth.uid());

create policy "Users can read own blocks"
on public.blocks for select
to authenticated
using (blocker_id = auth.uid());

create policy "Users can delete own blocks"
on public.blocks for delete
to authenticated
using (blocker_id = auth.uid());

create policy "Users can create reports"
on public.reports for insert
to authenticated
with check (reporter_id = auth.uid());

create policy "Users can read own reports"
on public.reports for select
to authenticated
using (reporter_id = auth.uid());

create policy "Users can read own media"
on public.media_assets for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can read ready public media metadata"
on public.media_assets for select
to authenticated
using (
  visibility = 'public'
  and status = 'ready'
  and moderation_status = 'approved'
  and deleted_at is null
);

create policy "Conversation members can read ready conversation media metadata"
on public.media_assets for select
to authenticated
using (
  visibility = 'conversation_members'
  and status = 'ready'
  and moderation_status = 'approved'
  and exists (
    select 1
    from public.messages m
    where m.body like '%' || media_assets.id::text || '%'
      and public.is_conversation_member(m.conversation_id, auth.uid())
  )
);
