create extension if not exists pgtap with schema extensions;

begin;

select plan(46);

create or replace function public.test_set_conversation_actor_v1(
  p_account_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_account_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_account_id,
      'role', 'authenticated',
      'session_id', p_session_id,
      'iat', extract(epoch from now() - interval '1 minute')::bigint,
      'exp', extract(epoch from now() + interval '1 hour')::bigint
    )::text,
    true
  );
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
)
values
  ('01000000-0000-4000-8000-000000000401', 'authenticated', 'authenticated', 'conversation-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000402', 'authenticated', 'authenticated', 'conversation-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000403', 'authenticated', 'authenticated', 'conversation-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000000401', 'Conversation A'),
  ('01000000-0000-4000-8000-000000000402', 'Conversation B'),
  ('01000000-0000-4000-8000-000000000403', 'Conversation C');

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
)
values
  ('20000000-0000-4000-8000-000000000401', '01000000-0000-4000-8000-000000000401', '01000000-0000-4000-8000-000000000401', 'active', 2, true, true),
  ('20000000-0000-4000-8000-000000000402', '01000000-0000-4000-8000-000000000402', '01000000-0000-4000-8000-000000000402', 'active', 2, true, true),
  ('20000000-0000-4000-8000-000000000403', '01000000-0000-4000-8000-000000000403', '01000000-0000-4000-8000-000000000403', 'active', 2, true, true);

insert into public.player_profiles_v1 (
  id,
  player_id,
  legacy_profile_id,
  version,
  completed_at
)
values
  ('30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000401', '01000000-0000-4000-8000-000000000401', 1, now()),
  ('30000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000402', '01000000-0000-4000-8000-000000000402', 1, now()),
  ('30000000-0000-4000-8000-000000000403', '20000000-0000-4000-8000-000000000403', '01000000-0000-4000-8000-000000000403', 1, now());

update private.conversation_authority_config_v1
set bootstrap_enabled = true,
    reads_enabled = true,
    writes_enabled = true,
    realtime_enabled = false,
    image_messages_enabled = true;

insert into public.matches (
  id, profile_low_id, profile_high_id, player_low_id, player_high_id,
  source_v1, correlation_id_v1, home_kind_v1, home_status_v1
)
values (
  '60000000-0000-4000-8000-000000000401',
  '01000000-0000-4000-8000-000000000401',
  '01000000-0000-4000-8000-000000000402',
  '20000000-0000-4000-8000-000000000401',
  '20000000-0000-4000-8000-000000000402',
  'mutual_like',
  '70000000-0000-4000-8000-000000000401',
  'rank',
  'conversation_pending'
);

create temporary table bootstrap_event as
select private.enqueue_contract_event_v1(
  'conversation.bootstrap_requested.v1',
  'match',
  '60000000-0000-4000-8000-000000000401',
  '70000000-0000-4000-8000-000000000401',
  null,
  jsonb_build_object(
    'matchId', '60000000-0000-4000-8000-000000000401'::uuid,
    'participantIds', jsonb_build_array(
      '20000000-0000-4000-8000-000000000401'::uuid,
      '20000000-0000-4000-8000-000000000402'::uuid
    ),
    'requestedAt', now()
  ),
  'conversation.bootstrap_requested.v1:60000000-0000-4000-8000-000000000401'
) as id;

select has_column('public', 'conversations', 'last_sequence_v1', 'conversation stores canonical sequence');
select has_column('public', 'conversation_participants_v1', 'last_read_sequence', 'canonical participant stores read watermark');
select has_column('public', 'messages', 'client_message_id_v1', 'message stores client idempotency key');
select has_function(
  'public',
  'send_message_v1',
  array['uuid', 'text', 'jsonb', 'timestamp with time zone', 'uuid'],
  'authoritative send command exists'
);

create temporary table bootstrap_first as
select public.consume_conversation_bootstrap_event_v1((select id from bootstrap_event)) as receipt;

select is((select (receipt ->> 'repeated')::boolean from bootstrap_first), false, 'first bootstrap creates conversation');
select is(
  (select count(*)::integer from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  1,
  'one match maps to one conversation'
);
select is(
  (select count(*)::integer from private.conversation_bootstrap_receipts_v1 where match_id = '60000000-0000-4000-8000-000000000401'),
  1,
  'bootstrap receipt is persisted by MatchId'
);
select is(
  (select count(*)::integer from public.conversation_participants_v1 where conversation_id = (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401') and player_id is not null),
  2,
  'conversation has two PlayerId members'
);
select is(
  (select home_status_v1::text from public.matches where id = '60000000-0000-4000-8000-000000000401'),
  'conversation_ready',
  'bootstrap projects match home status ready'
);
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'conversation.created.v1'),
  1,
  'conversation.created.v1 is emitted once'
);

create temporary table bootstrap_retry as
select public.consume_conversation_bootstrap_event_v1((select id from bootstrap_event)) as receipt;

select is((select (receipt ->> 'repeated')::boolean from bootstrap_retry), true, 'bootstrap retry returns canonical conversation');
select is(
  (select count(*)::integer from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  1,
  'bootstrap retry creates no duplicate'
);

create temporary table bootstrap_conflict_event as
select private.enqueue_contract_event_v1(
  'conversation.bootstrap_requested.v1',
  'match',
  '60000000-0000-4000-8000-000000000401',
  '70000000-0000-4000-8000-000000000402',
  null,
  jsonb_build_object(
    'matchId', '60000000-0000-4000-8000-000000000401'::uuid,
    'participantIds', jsonb_build_array(
      '20000000-0000-4000-8000-000000000401'::uuid,
      '20000000-0000-4000-8000-000000000403'::uuid
    ),
    'requestedAt', now()
  ),
  'conversation.bootstrap_requested.v1:conflict:60000000-0000-4000-8000-000000000401'
) as id;

select throws_ok(
  format('select public.consume_conversation_bootstrap_event_v1(%L::uuid)', (select id from bootstrap_conflict_event)),
  '23505',
  'Bootstrap participants conflict with authoritative match',
  'conflicting bootstrap participant set is rejected'
);

set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);

create temporary table text_send_first as
select public.send_message_v1(
  (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  'client-message-a-00000001',
  '{"kind":"text","text":"Duo rank nhé?"}'::jsonb,
  now(),
  '70000000-0000-4000-8000-000000000411'
) as receipt;

select is((select (receipt ->> 'repeated')::boolean from text_send_first), false, 'first text send creates message');
select is((select (receipt #>> '{message,sequence}')::integer from text_send_first), 1, 'first message gets sequence one');

create temporary table text_send_retry as
select public.send_message_v1(
  (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  'client-message-a-00000001',
  '{"kind":"text","text":"Duo rank nhé?"}'::jsonb,
  now(),
  '70000000-0000-4000-8000-000000000499'
) as receipt;

reset role;

select is((select (receipt ->> 'repeated')::boolean from text_send_retry), true, 'same clientMessageId replays original message');
select is((select count(*)::integer from public.messages where schema_version_v1 = 1), 1, 'retry creates no message duplicate');
select is((select count(*)::integer from private.outbox_events where event_type = 'message.sent.v1'), 1, 'message.sent.v1 is emitted once');
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'notification.requested.v1' and payload #>> '{data,reasonCode}' = 'message_received'),
  1,
  'one message attention event is emitted'
);

set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);
select throws_ok(
  $$select public.send_message_v1(
    (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
    'client-message-a-00000001',
    '{"kind":"text","text":"Different payload"}'::jsonb,
    now(),
    '70000000-0000-4000-8000-000000000412'
  )$$,
  '23505',
  'Client message ID was reused with different content',
  'conflicting clientMessageId payload is rejected'
);

reset role;
insert into public.media_assets (
  id, owner_id, purpose, object_key, original_filename, mime_type,
  byte_size, visibility, status, moderation_status
)
values (
  '92000000-0000-4000-8000-000000000401',
  '01000000-0000-4000-8000-000000000401',
  'chat_attachment',
  'chat/92000000-0000-4000-8000-000000000401.webp',
  'build.webp',
  'image/webp',
  1024,
  'conversation_members',
  'ready',
  'approved'
);

set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);

create temporary table image_send as
select public.send_message_v1(
  (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  'client-message-a-00000002',
  '{"kind":"media","assetId":"92000000-0000-4000-8000-000000000401","caption":"Build hiện tại"}'::jsonb,
  now(),
  '70000000-0000-4000-8000-000000000413'
) as receipt;

select is((select (receipt #>> '{message,sequence}')::integer from image_send), 2, 'image message gets next sequence');
select is(
  (select media_asset_id_v1::text from public.messages where sequence_v1 = 2),
  '92000000-0000-4000-8000-000000000401',
  'image stores explicit attachment association'
);
select is(
  (select array_agg(sequence_v1 order by sequence_v1)::text from public.messages where schema_version_v1 = 1),
  '{1,2}',
  'message sequences are contiguous and monotonic'
);

reset role;
update private.conversation_authority_config_v1
set image_messages_enabled = false;
set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);
select is(
  (
    public.send_message_v1(
      (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
      'client-message-a-00000002',
      '{"kind":"media","assetId":"92000000-0000-4000-8000-000000000401","caption":"Build hiện tại"}'::jsonb,
      now(),
      '70000000-0000-4000-8000-000000000498'
    ) ->> 'repeated'
  )::boolean,
  true,
  'committed image retry replays after image rollout is disabled'
);

select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000402',
  '09000000-0000-4000-8000-000000000402'
);

select is(
  (public.get_conversation_read_state_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) ->> 'unreadCount')::integer,
  2,
  'unread derives from messages after watermark'
);
select is(
  (public.get_conversation_surface_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) #>> '{conversation,unreadCount}')::integer,
  2,
  'mobile surface uses the same authoritative unread count'
);
select ok(
  (public.get_conversation_surface_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) #>> '{viewer,firstUnreadMessageId}') is not null,
  'mobile surface exposes the first unread message from the watermark'
);
select is(
  public.get_conversation_surface_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) #>> '{participants,0,displayName}',
  'Conversation A',
  'participant display is a projection of canonical participant mapping'
);
select is(
  (public.get_conversation_inbox_page_v1(30, null, null) ->> 'unreadConversationCount')::integer,
  1,
  'mobile inbox unread conversation count matches the authoritative watermark'
);
select is(
  (
    select jsonb_agg((message_json ->> 'sequence')::integer order by (message_json ->> 'sequence')::integer)
    from public.get_conversation_timeline_v1(
      (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
      50,
      null,
      0
    ) as timeline(message_json)
  ),
  '[1, 2]'::jsonb,
  'afterSequence query restores ordered gap'
);

create temporary table read_first as
select public.advance_conversation_read_v1(
  (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  2,
  '70000000-0000-4000-8000-000000000414'
) as receipt;

select is((select (receipt ->> 'repeated')::boolean from read_first), false, 'first read advances watermark');
select is((select (receipt #>> '{readState,lastReadSequence}')::integer from read_first), 2, 'watermark reaches requested sequence');
select is((select (receipt #>> '{readState,unreadCount}')::integer from read_first), 0, 'watermark clears unread');

create temporary table read_retry as
select public.advance_conversation_read_v1(
  (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
  2,
  '70000000-0000-4000-8000-000000000415'
) as receipt;

select is((select (receipt ->> 'repeated')::boolean from read_retry), true, 'repeated read is idempotent');

reset role;
select is((select count(*)::integer from private.outbox_events where event_type = 'conversation.read_advanced.v1'), 1, 'read retry emits no duplicate event');
set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000402',
  '09000000-0000-4000-8000-000000000402'
);
select is(
  (select count(*)::integer from public.get_conversation_inbox_v1(30, null, null) as inbox(snapshot)),
  1,
  'restart inbox restores conversation'
);
select is((public.get_conversation_unread_summary_v1() ->> 'unreadCount')::integer, 0, 'unread summary matches watermark');
select is(
  (public.get_conversation_surface_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) #>> '{conversation,unreadCount}')::integer,
  0,
  'mobile surface unread returns to zero after authoritative read advance'
);
select ok(not has_table_privilege('authenticated', 'public.messages', 'INSERT'), 'direct message insert is revoked');

reset role;
update public.players
set lifecycle_state = 'suspended', discoverable = false, messaging_allowed = false, lifecycle_version = lifecycle_version + 1
where account_id = '01000000-0000-4000-8000-000000000401';

set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);

select is(
  (
    public.send_message_v1(
      (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
      'client-message-a-00000001',
      '{"kind":"text","text":"Duo rank nhé?"}'::jsonb,
      now(),
      '70000000-0000-4000-8000-000000000417'
    ) ->> 'repeated'
  )::boolean,
  true,
  'committed retry replays before current lifecycle policy'
);
select is(
  (public.get_conversation_surface_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) #>> '{viewer,canMessage}')::boolean,
  false,
  'mobile surface projects suspended messaging capability without inferring profile state'
);

reset role;
update private.conversation_authority_config_v1
set realtime_enabled = true;
set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);
select ok(
  not public.can_subscribe_conversation_v1(
    'conversation:' || (
      select id::text
      from public.conversations
      where match_id = '60000000-0000-4000-8000-000000000401'
    )
  ),
  'suspended participant cannot subscribe to private realtime'
);

reset role;
update public.players
set lifecycle_state = 'suspended', discoverable = false, messaging_allowed = false, lifecycle_version = lifecycle_version + 1
where account_id = '01000000-0000-4000-8000-000000000402';

set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000402',
  '09000000-0000-4000-8000-000000000402'
);

select throws_ok(
  $$select public.send_message_v1(
    (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
    'client-message-b-suspended',
    '{"kind":"text","text":"Blocked"}'::jsonb,
    now(),
    '70000000-0000-4000-8000-000000000416'
  )$$,
  '42501',
  'Suspended players cannot send messages',
  'suspended participant cannot send'
);

reset role;
update public.players
set auth_user_id = null
where account_id = '01000000-0000-4000-8000-000000000402';

set local role authenticated;
select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000401',
  '09000000-0000-4000-8000-000000000401'
);
select is(
  public.get_conversation_surface_v1((select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401')) #>> '{participants,1,displayName}',
  'Người chơi đã xóa',
  'deleted participant is rendered through the conversation tombstone policy'
);

select public.test_set_conversation_actor_v1(
  '01000000-0000-4000-8000-000000000403',
  '09000000-0000-4000-8000-000000000403'
);
select throws_ok(
  $$select * from public.get_conversation_timeline_v1(
    (select id from public.conversations where match_id = '60000000-0000-4000-8000-000000000401'),
    50,
    null,
    0
  )$$,
  '42501',
  'Conversation membership required',
  'nonparticipant cannot read timeline'
);

reset role;
select is(
  (select status::text from private.outbox_events where id = (select id from bootstrap_event)),
  'processed',
  'bootstrap delivery is marked processed'
);

select * from finish();
rollback;
