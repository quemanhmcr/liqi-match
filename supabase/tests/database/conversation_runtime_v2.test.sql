create extension if not exists pgtap with schema extensions;

begin;
set local search_path = extensions, public, pg_catalog;
select plan(27);

create or replace function public.test_set_conversation_actor_v2(
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

grant execute on function public.test_set_conversation_actor_v2(uuid, uuid)
  to authenticated;

create or replace function public.test_capture_conversation_error_v2(p_sql text)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  execute p_sql;
  return jsonb_build_object('raised', false);
exception when others then
  return jsonb_build_object(
    'raised', true,
    'sqlstate', sqlstate,
    'error', sqlerrm::jsonb
  );
end;
$$;

grant execute on function public.test_capture_conversation_error_v2(text)
  to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
)
values
  ('01000000-0000-4000-8000-000000009901', 'authenticated', 'authenticated', 'conversation-cloud-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000009902', 'authenticated', 'authenticated', 'conversation-cloud-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000009901', 'Conversation Cloud A'),
  ('01000000-0000-4000-8000-000000009902', 'Conversation Cloud B');

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
  ('20000000-0000-4000-8000-000000009901', '01000000-0000-4000-8000-000000009901', '01000000-0000-4000-8000-000000009901', 'active', 2, true, true),
  ('20000000-0000-4000-8000-000000009902', '01000000-0000-4000-8000-000000009902', '01000000-0000-4000-8000-000000009902', 'active', 2, true, true);

insert into public.player_profiles_v1 (
  id,
  player_id,
  legacy_profile_id,
  version,
  completed_at
)
values
  ('30000000-0000-4000-8000-000000009901', '20000000-0000-4000-8000-000000009901', '01000000-0000-4000-8000-000000009901', 1, now()),
  ('30000000-0000-4000-8000-000000009902', '20000000-0000-4000-8000-000000009902', '01000000-0000-4000-8000-000000009902', 1, now());

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'test.provision_first',
  public.provision_direct_conversation_v2(
    jsonb_build_object(
      'source', jsonb_build_object(
        'sourceType', 'direct_match',
        'sourceId', '66000000-0000-4000-8000-000000009901'::uuid,
        'sourceAggregateVersion', 1
      ),
      'participantPlayerIds', jsonb_build_array(
        '20000000-0000-4000-8000-000000009901'::uuid,
        '20000000-0000-4000-8000-000000009902'::uuid
      ),
      'metadata', jsonb_build_object(
        'idempotencyKey', 'cloud-provision-0001',
        'correlationId', '77000000-0000-4000-8000-000000009901'::uuid,
        'expectedAggregateVersion', 0,
        'audit', jsonb_build_object(
          'requestId', 'cloud-provision-request-0001',
          'clientCreatedAt', '2026-07-15T00:00:00Z',
          'clientPlatform', 'simulation'
        )
      )
    )
  )::text,
  true
);
reset role;

select is(
  (current_setting('test.provision_first')::jsonb ->> 'repeated')::boolean,
  false,
  'first service provision is not a replay'
);
select is(
  (current_setting('test.provision_first')::jsonb ->> 'aggregateVersion')::integer,
  1,
  'new direct conversation starts at aggregate version one'
);
select is(
  (
    select count(*)::integer
    from public.conversation_members_v2
    where conversation_id = (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid
      and state = 'active'
      and can_message
      and can_view_conversation
  ),
  2,
  'service provision creates exactly two active canonical PlayerId members'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'test.provision_retry',
  public.provision_direct_conversation_v2(
    jsonb_build_object(
      'source', jsonb_build_object(
        'sourceType', 'direct_match',
        'sourceId', '66000000-0000-4000-8000-000000009901'::uuid,
        'sourceAggregateVersion', 1
      ),
      'participantPlayerIds', jsonb_build_array(
        '20000000-0000-4000-8000-000000009901'::uuid,
        '20000000-0000-4000-8000-000000009902'::uuid
      ),
      'metadata', jsonb_build_object(
        'idempotencyKey', 'cloud-provision-0001',
        'correlationId', '77000000-0000-4000-8000-000000009901'::uuid,
        'expectedAggregateVersion', 0,
        'audit', jsonb_build_object(
          'requestId', 'cloud-provision-request-0001',
          'clientCreatedAt', '2026-07-15T00:00:00Z',
          'clientPlatform', 'simulation'
        )
      )
    )
  )::text,
  true
);
reset role;

select is(
  (current_setting('test.provision_retry')::jsonb ->> 'repeated')::boolean,
  true,
  'exact service command replay returns the durable receipt'
);
select is(
  (
    select count(*)::integer
    from public.conversations_v2
    where id = (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid
  ),
  1,
  'service replay creates no duplicate conversation'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009901',
  '99000000-0000-4000-8000-000000009901'
);
select set_config(
  'test.send_a',
  public.send_message_v2(
    jsonb_build_object(
      'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
      'clientMessageId', 'cloud-client-message-a-0001',
      'text', 'Cloud database message A',
      'metadata', jsonb_build_object(
        'idempotencyKey', 'cloud-send-a-0000001',
        'correlationId', '77000000-0000-4000-8000-000000009911'::uuid,
        'expectedAggregateVersion', 1,
        'audit', jsonb_build_object(
          'requestId', 'cloud-send-a-request-0001',
          'clientCreatedAt', '2026-07-15T00:01:00Z',
          'clientPlatform', 'simulation'
        )
      )
    )
  )::text,
  true
);
reset role;

select is(
  (current_setting('test.send_a')::jsonb ->> 'repeated')::boolean,
  false,
  'first actor A send is accepted once'
);
select is(
  current_setting('test.send_a')::jsonb #>> '{message,sequence}',
  '1',
  'first accepted message receives sequence one'
);
select is(
  current_setting('test.send_a')::jsonb ->> 'aggregateVersion',
  '2',
  'first accepted message advances the conversation aggregate version'
);
select is(
  (
    select state::text
    from public.message_receipts_v2
    where message_id = (current_setting('test.send_a')::jsonb #>> '{message,messageId}')::uuid
      and recipient_player_id = '20000000-0000-4000-8000-000000009902'
  ),
  'queued',
  'recipient B gets a queued authoritative delivery receipt'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009901',
  '99000000-0000-4000-8000-000000009901'
);
select set_config(
  'test.send_a_semantic_retry',
  public.send_message_v2(
    jsonb_build_object(
      'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
      'clientMessageId', 'cloud-client-message-a-0001',
      'text', 'Cloud database message A',
      'metadata', jsonb_build_object(
        'idempotencyKey', 'cloud-send-a-retry-0001',
        'correlationId', '77000000-0000-4000-8000-000000009912'::uuid,
        'expectedAggregateVersion', 1,
        'audit', jsonb_build_object(
          'requestId', 'cloud-send-a-retry-request-0001',
          'clientCreatedAt', '2026-07-15T00:01:30Z',
          'clientPlatform', 'simulation'
        )
      )
    )
  )::text,
  true
);
reset role;

select is(
  (current_setting('test.send_a_semantic_retry')::jsonb ->> 'repeated')::boolean,
  true,
  'same semantic clientMessageId replays before stale aggregate validation'
);
select is(
  (
    select count(*)::integer
    from public.messages_v2
    where conversation_id = (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid
      and sender_player_id = '20000000-0000-4000-8000-000000009901'
      and client_message_id = 'cloud-client-message-a-0001'
  ),
  1,
  'semantic retry creates no duplicate message'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009901',
  '99000000-0000-4000-8000-000000009901'
);
select set_config(
  'test.send_a_conflict_error',
  public.test_capture_conversation_error_v2(
    format(
      'select public.send_message_v2(%L::jsonb)',
      jsonb_build_object(
        'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
        'clientMessageId', 'cloud-client-message-a-0001',
        'text', 'Different payload',
        'metadata', jsonb_build_object(
          'idempotencyKey', 'cloud-send-a-conflict-0001',
          'correlationId', '77000000-0000-4000-8000-000000009913'::uuid,
          'expectedAggregateVersion', 2,
          'audit', jsonb_build_object(
            'requestId', 'cloud-send-a-conflict-request-0001',
            'clientCreatedAt', '2026-07-15T00:02:00Z',
            'clientPlatform', 'simulation'
          )
        )
      )::text
    )
  )::text,
  true
);
reset role;

select is(
  current_setting('test.send_a_conflict_error')::jsonb #>> '{error,code}',
  'message_idempotency_conflict',
  'same clientMessageId with different content is rejected'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009902',
  '99000000-0000-4000-8000-000000009902'
);
select set_config(
  'test.send_b_stale_error',
  public.test_capture_conversation_error_v2(
    format(
      'select public.send_message_v2(%L::jsonb)',
      jsonb_build_object(
        'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
        'clientMessageId', 'cloud-client-message-b-stale-0001',
        'text', 'Stale B message',
        'metadata', jsonb_build_object(
          'idempotencyKey', 'cloud-send-b-stale-0001',
          'correlationId', '77000000-0000-4000-8000-000000009921'::uuid,
          'expectedAggregateVersion', 1,
          'audit', jsonb_build_object(
            'requestId', 'cloud-send-b-stale-request-0001',
            'clientCreatedAt', '2026-07-15T00:02:30Z',
            'clientPlatform', 'simulation'
          )
        )
      )::text
    )
  )::text,
  true
);
reset role;

select is(
  current_setting('test.send_b_stale_error')::jsonb #>> '{error,code}',
  'conversation_version_conflict',
  'concurrent actor B stale aggregate send is retryable and rejected'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009902',
  '99000000-0000-4000-8000-000000009902'
);
select set_config(
  'test.send_b',
  public.send_message_v2(
    jsonb_build_object(
      'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
      'clientMessageId', 'cloud-client-message-b-0001',
      'text', 'Cloud database message B',
      'metadata', jsonb_build_object(
        'idempotencyKey', 'cloud-send-b-0000001',
        'correlationId', '77000000-0000-4000-8000-000000009922'::uuid,
        'expectedAggregateVersion', 2,
        'audit', jsonb_build_object(
          'requestId', 'cloud-send-b-request-0001',
          'clientCreatedAt', '2026-07-15T00:03:00Z',
          'clientPlatform', 'simulation'
        )
      )
    )
  )::text,
  true
);
reset role;

select is(
  current_setting('test.send_b')::jsonb #>> '{message,sequence}',
  '2',
  'actor B retry with refreshed version receives sequence two'
);
select is(
  current_setting('test.send_b')::jsonb ->> 'aggregateVersion',
  '3',
  'second accepted message advances aggregate version to three'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009901',
  '99000000-0000-4000-8000-000000009901'
);
select set_config(
  'test.read_a',
  public.advance_read_cursor_v2(
    jsonb_build_object(
      'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
      'lastReadSequence', 2,
      'metadata', jsonb_build_object(
        'idempotencyKey', 'cloud-read-a-0000001',
        'correlationId', '77000000-0000-4000-8000-000000009931'::uuid,
        'expectedAggregateVersion', 2,
        'audit', jsonb_build_object(
          'requestId', 'cloud-read-a-request-0001',
          'clientCreatedAt', '2026-07-15T00:04:00Z',
          'clientPlatform', 'simulation'
        )
      )
    )
  )::text,
  true
);
reset role;

select is(
  current_setting('test.read_a')::jsonb #>> '{readCursor,lastReadSequence}',
  '2',
  'actor A advances the authoritative read cursor to sequence two'
);
select is(
  current_setting('test.read_a')::jsonb #>> '{readCursor,version}',
  '3',
  'read cursor version advances independently to three'
);
select is(
  (
    select state::text
    from public.message_receipts_v2
    where message_id = (current_setting('test.send_b')::jsonb #>> '{message,messageId}')::uuid
      and recipient_player_id = '20000000-0000-4000-8000-000000009901'
  ),
  'read',
  'read advance marks B message receipt read for A'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009901',
  '99000000-0000-4000-8000-000000009901'
);
select set_config(
  'test.a_message_topic',
  public.can_subscribe_conversation_v2(
    'conversation-v2:' || (current_setting('test.provision_first')::jsonb ->> 'conversationId')
  )::text,
  true
);
select set_config(
  'test.a_own_access_topic',
  public.can_subscribe_conversation_access_v2(
    'conversation-v2-access:' ||
    (current_setting('test.provision_first')::jsonb ->> 'conversationId') ||
    ':20000000-0000-4000-8000-000000009901'
  )::text,
  true
);
select set_config(
  'test.a_other_access_topic',
  public.can_subscribe_conversation_access_v2(
    'conversation-v2-access:' ||
    (current_setting('test.provision_first')::jsonb ->> 'conversationId') ||
    ':20000000-0000-4000-8000-000000009902'
  )::text,
  true
);
reset role;

select ok(
  current_setting('test.a_message_topic')::boolean,
  'active actor A can subscribe to the private message topic'
);
select ok(
  current_setting('test.a_own_access_topic')::boolean
  and not current_setting('test.a_other_access_topic')::boolean,
  'actor A can subscribe only to own targeted access topic'
);

update public.conversation_members_v2
set state = 'revoked',
    can_message = false,
    can_view_conversation = false,
    membership_version = membership_version + 1,
    version = version + 1,
    revoked_at = now(),
    revocation_reason = 'source_membership_revoked'
where conversation_id = (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid
  and player_id = '20000000-0000-4000-8000-000000009902';

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009902',
  '99000000-0000-4000-8000-000000009902'
);
select set_config(
  'test.b_message_topic_after_revoke',
  public.can_subscribe_conversation_v2(
    'conversation-v2:' || (current_setting('test.provision_first')::jsonb ->> 'conversationId')
  )::text,
  true
);
select set_config(
  'test.b_access_topic_after_revoke',
  public.can_subscribe_conversation_access_v2(
    'conversation-v2-access:' ||
    (current_setting('test.provision_first')::jsonb ->> 'conversationId') ||
    ':20000000-0000-4000-8000-000000009902'
  )::text,
  true
);
select set_config(
  'test.b_get_after_revoke_error',
  public.test_capture_conversation_error_v2(
    format(
      'select public.get_conversation_v2(%L::uuid)',
      current_setting('test.provision_first')::jsonb ->> 'conversationId'
    )
  )::text,
  true
);
select set_config(
  'test.b_send_after_revoke_error',
  public.test_capture_conversation_error_v2(
    format(
      'select public.send_message_v2(%L::jsonb)',
      jsonb_build_object(
        'conversationId', (current_setting('test.provision_first')::jsonb ->> 'conversationId')::uuid,
        'clientMessageId', 'cloud-client-message-b-revoked-0001',
        'text', 'Must not send',
        'metadata', jsonb_build_object(
          'idempotencyKey', 'cloud-send-b-revoked-0001',
          'correlationId', '77000000-0000-4000-8000-000000009923'::uuid,
          'expectedAggregateVersion', 3,
          'audit', jsonb_build_object(
            'requestId', 'cloud-send-b-revoked-request-0001',
            'clientCreatedAt', '2026-07-15T00:05:00Z',
            'clientPlatform', 'simulation'
          )
        )
      )::text
    )
  )::text,
  true
);
reset role;

select ok(
  not current_setting('test.b_message_topic_after_revoke')::boolean,
  'revoked actor B immediately loses private message topic authority'
);
select ok(
  current_setting('test.b_access_topic_after_revoke')::boolean,
  'historical member B keeps only own targeted access topic for revoke delivery'
);
select is(
  current_setting('test.b_get_after_revoke_error')::jsonb #>> '{error,code}',
  'conversation_access_revoked',
  'revoked actor B cannot read the conversation surface'
);
select is(
  current_setting('test.b_send_after_revoke_error')::jsonb #>> '{error,code}',
  'conversation_access_revoked',
  'revoked actor B cannot send even with current aggregate version'
);

create table public.test_realtime_messages_v2 (
  id uuid primary key,
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean not null default true
);

alter table public.test_realtime_messages_v2 enable row level security;
grant select on public.test_realtime_messages_v2 to authenticated;

create policy test_conversation_v2_message_broadcast_policy
on public.test_realtime_messages_v2 for select
to authenticated
using (
  extension = 'broadcast'
  and public.can_subscribe_conversation_v2(realtime.topic())
);

create policy test_conversation_v2_access_broadcast_policy
on public.test_realtime_messages_v2 for select
to authenticated
using (
  extension = 'broadcast'
  and public.can_subscribe_conversation_access_v2(realtime.topic())
);

insert into public.test_realtime_messages_v2 (
  id,
  topic,
  extension,
  payload,
  event,
  private
)
values
  (
    '88000000-0000-4000-8000-000000009901',
    'conversation-v2:' || (current_setting('test.provision_first')::jsonb ->> 'conversationId'),
    'broadcast',
    '{"kind":"message"}'::jsonb,
    'message.changed',
    true
  ),
  (
    '88000000-0000-4000-8000-000000009902',
    'conversation-v2-access:' ||
      (current_setting('test.provision_first')::jsonb ->> 'conversationId') ||
      ':20000000-0000-4000-8000-000000009902',
    'broadcast',
    '{"kind":"access"}'::jsonb,
    'access.changed',
    true
  );

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009902',
  '99000000-0000-4000-8000-000000009902'
);
select set_config(
  'realtime.topic',
  'conversation-v2-access:' ||
    (current_setting('test.provision_first')::jsonb ->> 'conversationId') ||
    ':20000000-0000-4000-8000-000000009902',
  true
);
select set_config(
  'test.b_rls_access_count',
  (
    select count(*)::text
    from public.test_realtime_messages_v2
    where id = '88000000-0000-4000-8000-000000009902'
  ),
  true
);
select set_config(
  'realtime.topic',
  'conversation-v2:' || (current_setting('test.provision_first')::jsonb ->> 'conversationId'),
  true
);
select set_config(
  'test.b_rls_message_count',
  (
    select count(*)::text
    from public.test_realtime_messages_v2
    where id = '88000000-0000-4000-8000-000000009901'
  ),
  true
);
reset role;

select is(
  current_setting('test.b_rls_access_count')::integer,
  1,
  'Realtime RLS exposes revoked B own targeted access broadcast row'
);
select is(
  current_setting('test.b_rls_message_count')::integer,
  0,
  'Realtime RLS hides future message broadcast rows from revoked B'
);

set local role authenticated;
select public.test_set_conversation_actor_v2(
  '01000000-0000-4000-8000-000000009901',
  '99000000-0000-4000-8000-000000009901'
);
select set_config(
  'realtime.topic',
  'conversation-v2-access:' ||
    (current_setting('test.provision_first')::jsonb ->> 'conversationId') ||
    ':20000000-0000-4000-8000-000000009902',
  true
);
select set_config(
  'test.a_rls_b_access_count',
  (
    select count(*)::text
    from public.test_realtime_messages_v2
    where id = '88000000-0000-4000-8000-000000009902'
  ),
  true
);
reset role;

select is(
  current_setting('test.a_rls_b_access_count')::integer,
  0,
  'Realtime RLS prevents A from reading B targeted access broadcast row'
);

select * from finish(true);
rollback;
