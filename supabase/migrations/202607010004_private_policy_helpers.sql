create or replace function private.are_profiles_blocked(left_profile_id uuid, right_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = left_profile_id and b.blocked_id = right_profile_id)
       or (b.blocker_id = right_profile_id and b.blocked_id = left_profile_id)
  );
$$;

create or replace function private.is_conversation_member(conversation_id uuid, profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = $1
      and cm.profile_id = $2
  );
$$;

create or replace function private.is_conversation_member_for_media(media_asset_id uuid, profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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
      and private.is_conversation_member(m.conversation_id, $2)
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.record_swipe(target_profile_id uuid, direction public.swipe_direction)
returns table(match_id uuid, conversation_id uuid, matched boolean)
language plpgsql
security definer
set search_path = ''
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

  if not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and deleted_at is null
  ) then
    raise exception 'Actor profile not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_profile_id
      and deleted_at is null
      and is_discoverable
  ) then
    raise exception 'Target profile not available' using errcode = 'P0002';
  end if;

  if private.are_profiles_blocked(actor_profile_id, target_profile_id) then
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
set search_path = ''
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

drop policy if exists "Profiles are readable when discoverable or own" on public.profiles;
create policy "Profiles are readable when discoverable or own"
on public.profiles for select
to authenticated
using (
  deleted_at is null
  and (
    id = auth.uid()
    or (
      is_discoverable
      and not private.are_profiles_blocked(auth.uid(), id)
    )
  )
);

drop policy if exists "Users can read own game profile and discoverable profiles" on public.game_profiles;
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
      and not private.are_profiles_blocked(auth.uid(), p.id)
  )
);

drop policy if exists "Conversation members can read conversations" on public.conversations;
create policy "Conversation members can read conversations"
on public.conversations for select
to authenticated
using (private.is_conversation_member(id, auth.uid()));

drop policy if exists "Conversation members can read membership" on public.conversation_members;
create policy "Conversation members can read membership"
on public.conversation_members for select
to authenticated
using (private.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Conversation members can read messages" on public.messages;
create policy "Conversation members can read messages"
on public.messages for select
to authenticated
using (private.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Conversation members can insert own messages" on public.messages;
create policy "Conversation members can insert own messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and private.is_conversation_member(conversation_id, auth.uid())
);

drop policy if exists "Conversation members can read ready conversation media metadata" on public.media_assets;
create policy "Conversation members can read ready conversation media metadata"
on public.media_assets for select
to authenticated
using (
  visibility = 'conversation_members'
  and status = 'ready'
  and moderation_status = 'approved'
  and private.is_conversation_member_for_media(id, auth.uid())
);

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.are_profiles_blocked(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_conversation_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_conversation_member_for_media(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_swipe(uuid, public.swipe_direction) to authenticated;

drop function if exists public.are_profiles_blocked(uuid, uuid);
drop function if exists public.is_conversation_member(uuid, uuid);
drop function if exists public.is_conversation_member_for_media(uuid, uuid);
