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
  values (actor_profile_id, target_profile_id, $2)
  on conflict (actor_id, target_id) do update
    set direction = excluded.direction,
        created_at = now();

  if $2 = 'like' and exists (
    select 1
    from public.swipes
    where actor_id = target_profile_id
      and target_id = actor_profile_id
      and public.swipes.direction = 'like'
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

revoke execute on function public.record_swipe(uuid, public.swipe_direction) from public, anon;
grant execute on function public.record_swipe(uuid, public.swipe_direction) to authenticated;
