create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

select has_column(
  'public',
  'play_sessions_v2',
  'source_repeat_request_id',
  'Session source persists the canonical RepeatPlayRequestId'
);
select has_table(
  'private',
  'repeat_play_session_consumptions_v2',
  'repeat-play Session consumer has a durable replay ledger'
);
select has_function(
  'public',
  'consume_repeat_play_session_event_v2',
  array['uuid'],
  'service-role repeat-play event consumer exists'
);
select has_function(
  'public',
  'process_pending_repeat_play_session_events_v2',
  array['integer'],
  'repeat-play reconciliation worker exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_repeat_play_session_event_v2(uuid)',
    'EXECUTE'
  ),
  'service role may consume repeat-play events'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_repeat_play_session_event_v2(uuid)',
    'EXECUTE'
  ),
  'mobile clients cannot consume repeat-play events'
);
select ok(
  position(
    'event_replay_conflict' in
    pg_get_functiondef(
      'private.consume_repeat_play_session_event_v2(uuid)'::regprocedure
    )
  ) > 0,
  'event replay conflicts fail with a stable error code'
);
select ok(
  position(
    'assert_session_invite_eligible_v2' in
    pg_get_functiondef(
      'private.consume_repeat_play_session_event_v2(uuid)'::regprocedure
    )
  ) > 0,
  'consumer rechecks Senior 1 relationship/privacy authority'
);
select ok(
  position(
    'assert_party_session_player_active_v2' in
    pg_get_functiondef(
      'private.consume_repeat_play_session_event_v2(uuid)'::regprocedure
    )
  ) > 0,
  'consumer rechecks Core V1 lifecycle authority'
);
select ok(
  position(
    'session.created.v2' in
    pg_get_functiondef(
      'private.consume_repeat_play_session_event_v2(uuid)'::regprocedure
    )
  ) > 0,
  'consumer publishes the canonical Session created event'
);
select ok(
  position(
    'for update skip locked' in lower(
      pg_get_functiondef(
        'public.process_pending_repeat_play_session_events_v2(integer)'::regprocedure
      )
    )
  ) > 0,
  'worker claims events concurrently with SKIP LOCKED'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'play_sessions_v2_source_repeat_request_idx'
      and indexdef like '%UNIQUE INDEX%'
  ),
  'one Repeat Play request can create at most one Session'
);

select * from finish();
rollback;
