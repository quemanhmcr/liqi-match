create extension if not exists pgtap with schema extensions;

begin;

select plan(12);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated', 'projection-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000402', 'authenticated', 'authenticated', 'projection-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000403', 'authenticated', 'authenticated', 'projection-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000401', 'Projection A'),
  ('00000000-0000-0000-0000-000000000402', 'Projection B'),
  ('00000000-0000-0000-0000-000000000403', 'Projection C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000401', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000402', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000403', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000403', 'active', 1, true, true);

insert into public.matches (
  id,
  profile_low_id,
  profile_high_id,
  player_low_id,
  player_high_id,
  source_v1,
  correlation_id_v1,
  home_kind_v1,
  home_status_v1
) values (
  '60000000-0000-4000-8000-000000000401',
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
  '20000000-0000-4000-8000-000000000401',
  '20000000-0000-4000-8000-000000000402',
  'mutual_like',
  '70000000-0000-4000-8000-000000000401',
  'normal',
  'conversation_pending'
);

insert into public.conversations (id, match_id)
values (
  '90000000-0000-4000-8000-000000000401',
  '60000000-0000-4000-8000-000000000401'
);

create temporary table projection_event as
select jsonb_build_object(
  'eventId', '80000000-0000-4000-8000-000000000401',
  'eventType', 'conversation.created.v1',
  'aggregateType', 'conversation',
  'aggregateId', '90000000-0000-4000-8000-000000000401',
  'occurredAt', '2026-07-14T08:05:01.000Z',
  'correlationId', '70000000-0000-4000-8000-000000000401',
  'causationId', '80000000-0000-4000-8000-000000000400',
  'data', jsonb_build_object(
    'conversation', jsonb_build_object(
      'conversationId', '90000000-0000-4000-8000-000000000401',
      'matchId', '60000000-0000-4000-8000-000000000401',
      'participantIds', jsonb_build_array(
        '20000000-0000-4000-8000-000000000402',
        '20000000-0000-4000-8000-000000000401'
      ),
      'state', 'open',
      'lastMessage', null,
      'unreadCount', 0,
      'version', 1
    ),
    'bootstrapEventId', '80000000-0000-4000-8000-000000000400'
  )
) as event;
grant select on table projection_event to service_role;

set local role service_role;

select throws_like(
  $$select public.apply_conversation_created_to_match_v1(
    jsonb_set(
      (select event from projection_event),
      '{data,conversation,participantIds,1}',
      '"20000000-0000-4000-8000-000000000403"'::jsonb
    )
  )$$,
  '%validation_failed%',
  'participant mismatch is rejected'
);
select is(
  (select home_status_v1::text from public.matches where id = '60000000-0000-4000-8000-000000000401'),
  'conversation_pending',
  'rejected projection leaves the Match pending'
);

create temporary table projection_first as
select public.apply_conversation_created_to_match_v1(
  (select event from projection_event)
) as receipt;
create temporary table projection_retry as
select public.apply_conversation_created_to_match_v1(
  (select event from projection_event)
) as receipt;

select is(
  (select receipt ->> 'homeStatus' from projection_first),
  'conversation_ready',
  'conversation.created transitions the Match Home fact to ready'
);
select is(
  (select (receipt ->> 'repeated')::boolean from projection_first),
  false,
  'first projection application is not a replay'
);
select is(
  (select (receipt ->> 'repeated')::boolean from projection_retry),
  true,
  'retry is idempotent'
);
select is(
  (select home_status_v1::text from public.matches where id = '60000000-0000-4000-8000-000000000401'),
  'conversation_ready',
  'authoritative Home status is persisted'
);
select is(
  (select receipt ->> 'conversationId' from projection_first),
  '90000000-0000-4000-8000-000000000401',
  'receipt exposes the canonical ConversationId'
);
select is(
  (select receipt ->> 'correlationId' from projection_first),
  '70000000-0000-4000-8000-000000000401',
  'correlationId is preserved across the Match Loop'
);
select throws_like(
  $$select public.apply_conversation_created_to_match_v1(
    jsonb_set(
      (select event from projection_event),
      '{aggregateId}',
      '"90000000-0000-4000-8000-000000000499"'::jsonb
    )
  )$$,
  '%validation_failed%',
  'aggregate ConversationId must match the payload'
);
select throws_like(
  $$select public.apply_conversation_created_to_match_v1(
    jsonb_set(
      (select event from projection_event),
      '{eventType}',
      '"conversation.bootstrapped.v1"'::jsonb
    )
  )$$,
  '%validation_failed%',
  'legacy event names are rejected rather than creating duplicate semantics'
);

select throws_like(
  $$select public.apply_conversation_created_to_match_v1(
    jsonb_set(
      (select event from projection_event),
      '{correlationId}',
      '"70000000-0000-4000-8000-000000000499"'::jsonb
    )
  )$$,
  '%validation_failed%',
  'conversation correlation must match the canonical Match correlation'
);

reset role;
update public.matches
set home_status_v1 = 'closed'
where id = '60000000-0000-4000-8000-000000000401';
set local role service_role;
select throws_like(
  $$select public.apply_conversation_created_to_match_v1(
    (select event from projection_event)
  )$$,
  '%validation_failed%',
  'a delayed conversation event cannot reopen a closed Match'
);

reset role;
select * from finish();
rollback;
