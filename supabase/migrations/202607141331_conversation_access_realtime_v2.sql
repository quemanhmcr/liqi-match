-- Core V2 Conversation targeted access realtime
--
-- Message broadcasts remain protected by active canSubscribe authority. A
-- separate per-player topic carries only that player's membership/lifecycle or
-- conversation-state change so an already-open screen learns about revocation
-- after the transaction commits without exposing future message broadcasts.

create or replace function public.can_subscribe_conversation_access_v2(
  p_topic text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  conversation_id_value uuid;
  topic_player_id uuid;
begin
  if p_topic !~ '^conversation-v2-access:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  begin
    conversation_id_value := split_part(p_topic, ':', 2)::uuid;
    topic_player_id := split_part(p_topic, ':', 3)::uuid;
    actor := private.resolve_conversation_actor_v2(false, false);
    actor_player_id := (actor ->> 'playerId')::uuid;
  exception when others then
    return false;
  end;
  if actor_player_id is distinct from topic_player_id then return false; end if;
  return exists (
    select 1
    from public.conversation_members_v2 members
    where members.conversation_id = conversation_id_value
      and members.player_id = topic_player_id
  );
end;
$$;

create or replace function private.broadcast_conversation_member_access_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select realtime_enabled from private.conversation_authority_config_v2 where singleton)
    and (
      tg_op = 'INSERT'
      or old.state is distinct from new.state
      or old.can_message is distinct from new.can_message
      or old.can_view_conversation is distinct from new.can_view_conversation
      or old.membership_version is distinct from new.membership_version
      or old.revocation_reason is distinct from new.revocation_reason
    )
  then
    perform realtime.broadcast_changes(
      'conversation-v2-access:' || new.conversation_id::text || ':' || new.player_id::text,
      'access.changed',
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end if;
  return null;
end;
$$;

create or replace function private.broadcast_conversation_state_access_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
begin
  if (select realtime_enabled from private.conversation_authority_config_v2 where singleton)
    and old.state is distinct from new.state
  then
    for member in
      select members.player_id
      from public.conversation_members_v2 members
      where members.conversation_id = new.id
    loop
      perform realtime.broadcast_changes(
        'conversation-v2-access:' || new.id::text || ':' || member.player_id::text,
        'access.changed',
        tg_op,
        tg_table_name,
        tg_table_schema,
        new,
        old
      );
    end loop;
  end if;
  return null;
end;
$$;

create or replace function private.broadcast_player_conversation_access_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
begin
  if (select realtime_enabled from private.conversation_authority_config_v2 where singleton)
    and (
      old.lifecycle_state is distinct from new.lifecycle_state
      or old.messaging_allowed is distinct from new.messaging_allowed
    )
  then
    for member in
      select members.conversation_id
      from public.conversation_members_v2 members
      where members.player_id = new.id
    loop
      perform realtime.broadcast_changes(
        'conversation-v2-access:' || member.conversation_id::text || ':' || new.id::text,
        'access.changed',
        tg_op,
        tg_table_name,
        tg_table_schema,
        new,
        old
      );
    end loop;
  end if;
  return null;
end;
$$;

create trigger conversation_members_access_broadcast_v2
after insert or update on public.conversation_members_v2
for each row execute function private.broadcast_conversation_member_access_v2();

create trigger conversations_state_access_broadcast_v2
after update of state on public.conversations_v2
for each row execute function private.broadcast_conversation_state_access_v2();

create trigger players_conversation_access_broadcast_v2
after update of lifecycle_state, messaging_allowed on public.players
for each row execute function private.broadcast_player_conversation_access_v2();

create policy "Conversation V2 members receive own access changes"
on realtime.messages for select
to authenticated
using (
  extension = 'broadcast'
  and public.can_subscribe_conversation_access_v2(realtime.topic())
);

revoke execute on function public.can_subscribe_conversation_access_v2(text)
  from public, anon;
grant execute on function public.can_subscribe_conversation_access_v2(text)
  to authenticated;

comment on function public.can_subscribe_conversation_access_v2(text) is
  'Authorizes only the authenticated PlayerId own targeted access topic; historical membership permits revocation delivery but not message broadcasts.';
