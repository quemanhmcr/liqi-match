create extension if not exists pgtap with schema extensions;

begin;
set local search_path = extensions, public, pg_catalog;
select plan(26);

select has_function(
  'private',
  'conversation_participant_surface_json_v2',
  array['public.conversation_members_v2', 'uuid'],
  'participant display helper exists'
);
select has_function(
  'private',
  'conversation_latest_message_json_v2',
  array['public.conversations_v2'],
  'latest message helper exists'
);
select has_function(
  'private',
  'conversation_first_unread_message_id_v2',
  array['public.conversations_v2', 'uuid', 'bigint'],
  'first unread helper exists'
);
select has_function(
  'private',
  'conversation_mobile_surface_json_v2',
  array['uuid', 'uuid'],
  'private mobile surface helper exists'
);
select has_function(
  'public',
  'get_conversation_mobile_surface_v2',
  array['uuid'],
  'authenticated conversation surface RPC exists'
);
select has_function(
  'public',
  'list_conversation_mobile_inbox_v2',
  array['integer', 'timestamp with time zone', 'uuid'],
  'authenticated conversation inbox RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_conversation_mobile_surface_v2(uuid)',
    'EXECUTE'
  ),
  'authenticated may read a V2 conversation surface'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_conversation_mobile_inbox_v2(integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'authenticated may list the V2 mobile inbox'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_conversation_mobile_surface_v2(uuid)',
    'EXECUTE'
  ),
  'anon cannot read a V2 conversation surface'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_conversation_mobile_inbox_v2(integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'anon cannot list the V2 mobile inbox'
);
select ok(
  not has_function_privilege(
    'public',
    'public.get_conversation_mobile_surface_v2(uuid)',
    'EXECUTE'
  ),
  'public cannot bypass the authenticated surface RPC'
);
select ok(
  not has_function_privilege(
    'public',
    'public.list_conversation_mobile_inbox_v2(integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'public cannot bypass the authenticated inbox RPC'
);

select has_column(
  'public',
  'conversation_members_v2',
  'player_id',
  'mobile surface remains keyed by canonical PlayerId'
);
select has_column(
  'public',
  'conversation_read_cursors_v2',
  'last_read_sequence',
  'mobile unread state remains cursor-derived'
);
select has_column(
  'public',
  'conversations_v2',
  'last_sequence',
  'mobile unread state remains aggregate-sequence-derived'
);
select has_column(
  'public',
  'conversations_v2',
  'legacy_conversation_id',
  'mobile timeline can shadow-read V1 history additively'
);
select has_column(
  'public',
  'conversation_mutes_v2',
  'relationship_muted',
  'mobile mute display preserves relationship authority'
);
select has_column(
  'public',
  'messages_v2',
  'sequence',
  'mobile timeline uses canonical ordered message sequence'
);


select has_function(
  'public',
  'can_subscribe_conversation_access_v2',
  array['text'],
  'targeted access realtime authorization exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.can_subscribe_conversation_access_v2(text)',
    'EXECUTE'
  ),
  'authenticated may evaluate only its own targeted access topic'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.can_subscribe_conversation_access_v2(text)',
    'EXECUTE'
  ),
  'anon cannot evaluate targeted access topics'
);
select ok(
  not has_function_privilege(
    'public',
    'public.can_subscribe_conversation_access_v2(text)',
    'EXECUTE'
  ),
  'public cannot evaluate targeted access topics'
);
select has_trigger(
  'public',
  'conversation_members_v2',
  'conversation_members_access_broadcast_v2',
  'membership access changes broadcast to the targeted player topic'
);
select has_trigger(
  'public',
  'conversations_v2',
  'conversations_state_access_broadcast_v2',
  'conversation tombstone/state changes broadcast to historical members'
);
select has_trigger(
  'public',
  'players',
  'players_conversation_access_broadcast_v2',
  'player lifecycle and messaging changes broadcast to own conversation topics'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'Conversation V2 members receive own access changes'
  ),
  'targeted access messages use a private player-scoped RLS policy'
);

select * from finish(true);
rollback;
