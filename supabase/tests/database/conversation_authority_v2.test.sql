create extension if not exists pgtap with schema extensions;

begin;
set local search_path = extensions, public, pg_catalog;
select plan(60);

-- Canonical public authority tables.
select has_table('public', 'conversations_v2', 'conversations_v2 exists');
select has_table('public', 'conversation_sources_v2', 'conversation_sources_v2 exists');
select has_table('public', 'conversation_members_v2', 'conversation_members_v2 exists');
select has_table('public', 'messages_v2', 'messages_v2 exists');
select has_table('public', 'message_receipts_v2', 'message_receipts_v2 exists');
select has_table('public', 'conversation_read_cursors_v2', 'conversation_read_cursors_v2 exists');
select has_table('public', 'conversation_mutes_v2', 'conversation_mutes_v2 exists');
select has_table('public', 'message_report_evidence_v2', 'message_report_evidence_v2 exists');

-- Private coordination/receipt/rollout tables.
select has_table('private', 'conversation_direct_pairs_v2', 'direct pair uniqueness exists');
select has_table('private', 'conversation_service_command_receipts_v2', 'service receipts exist');
select has_table('private', 'conversation_consumed_events_v2', 'consumer replay ledger exists');
select has_table('private', 'conversation_relationship_versions_v2', 'relationship watermark exists');
select has_table('private', 'conversation_authority_config_v2', 'rollout config exists');
select has_table('private', 'conversation_authority_metrics_v2', 'observability facts exist');

-- Canonical PlayerId and aggregate references.
select col_is_fk('public', 'conversation_members_v2', 'player_id', 'member uses PlayerId FK');
select col_is_fk('public', 'messages_v2', 'sender_player_id', 'sender uses PlayerId FK');
select col_is_fk('public', 'message_receipts_v2', 'recipient_player_id', 'recipient uses PlayerId FK');
select col_is_fk('public', 'conversation_read_cursors_v2', 'player_id', 'cursor uses PlayerId FK');
select col_is_fk('public', 'conversation_mutes_v2', 'player_id', 'mute uses PlayerId FK');
select col_is_fk('public', 'message_report_evidence_v2', 'reporter_player_id', 'reporter uses PlayerId FK');
select col_is_fk('public', 'message_report_evidence_v2', 'sender_player_id', 'evidence sender uses PlayerId FK');
select col_is_fk('private', 'conversation_direct_pairs_v2', 'player_low_id', 'direct low uses PlayerId FK');
select col_is_fk('private', 'conversation_direct_pairs_v2', 'player_high_id', 'direct high uses PlayerId FK');

select col_is_fk('public', 'conversation_sources_v2', 'conversation_id', 'source references conversation');
select col_is_fk('public', 'conversation_members_v2', 'conversation_id', 'member references conversation');
select col_is_fk('public', 'messages_v2', 'conversation_id', 'message references conversation');
select col_is_fk('public', 'message_receipts_v2', 'message_id', 'receipt references message');
select col_is_fk('public', 'conversation_read_cursors_v2', 'conversation_id', 'cursor references conversation');
select col_is_fk('public', 'conversation_mutes_v2', 'conversation_id', 'mute references conversation');
select col_is_fk('public', 'message_report_evidence_v2', 'report_id', 'evidence references report');
select col_is_fk('public', 'message_report_evidence_v2', 'conversation_id', 'evidence references conversation');
select col_is_fk('public', 'message_report_evidence_v2', 'message_id', 'evidence references message');

-- Operational indexes.
select has_index('public', 'conversation_members_v2', 'conversation_members_v2_player_inbox_idx', 'member inbox index exists');
select has_index('public', 'messages_v2', 'messages_v2_timeline_idx', 'timeline index exists');
select has_index('public', 'message_receipts_v2', 'message_receipts_v2_recipient_state_idx', 'delivery index exists');
select has_index('public', 'message_report_evidence_v2', 'message_report_evidence_v2_message_idx', 'evidence index exists');
select has_index('private', 'conversation_authority_metrics_v2', 'conversation_authority_metrics_v2_name_time_idx', 'metrics index exists');
select has_index('public', 'reports_v2', 'reports_v2_conversation_message_v2_idx', 'V2 report target index exists');

-- Production command/read/consumer surfaces.
select has_function('public', 'provision_direct_conversation_v2', array['jsonb'], 'direct provisioning exists');
select has_function('public', 'provision_session_conversation_v2', array['jsonb'], 'session provisioning exists');
select has_function('public', 'reconcile_conversation_membership_v2', array['jsonb'], 'membership reconciliation exists');
select has_function('public', 'send_message_v2', array['jsonb'], 'text send exists');
select has_function('public', 'send_media_message_v2', array['jsonb'], 'media send exists');
select has_function('public', 'advance_read_cursor_v2', array['jsonb'], 'read cursor command exists');
select has_function('public', 'mute_conversation_v2', array['jsonb'], 'conversation mute exists');
select has_function('public', 'unmute_conversation_v2', array['jsonb'], 'conversation unmute exists');
select has_function('public', 'tombstone_conversation_v2', array['jsonb'], 'tombstone exists');
select has_function('public', 'get_conversation_v2', array['uuid'], 'conversation read exists');
select has_function('public', 'list_conversation_inbox_v2', array['integer','timestamp with time zone','uuid'], 'inbox read exists');
select has_function('public', 'get_conversation_timeline_v2', array['uuid','integer','bigint'], 'timeline read exists');
select has_function('public', 'can_subscribe_conversation_v2', array['text'], 'realtime authorization exists');
select has_function('public', 'consume_relationship_access_event_v2', array['jsonb'], 'relationship event consumer exists');
select has_function('public', 'reconcile_relationship_conversation_v2', array['jsonb'], 'relationship snapshot consumer exists');
select has_function('public', 'consume_session_conversation_event_v2', array['jsonb'], 'session event consumer exists');
select has_function('public', 'report_message_v2', array['jsonb'], 'message report command remains canonical');
select has_function('public', 'capture_message_report_evidence_v2', array['uuid'], 'evidence retry seam exists');

select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'conversations_v2','conversation_sources_v2','conversation_members_v2','messages_v2',
       'message_receipts_v2','conversation_read_cursors_v2','conversation_mutes_v2',
       'message_report_evidence_v2'
     ])),
  'all public Conversation V2 tables have RLS enabled'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'message_report_evidence_v2_immutable' and not tgisinternal
  ),
  'message report evidence is immutable'
);
select is(
  (select jsonb_build_object(
    'reads', reads_enabled,
    'writes', writes_enabled,
    'provisioning', provisioning_enabled,
    'realtime', realtime_enabled,
    'notifications', notifications_enabled,
    'shadowInbox', shadow_inbox_enabled
  ) from private.conversation_authority_config_v2 where singleton),
  jsonb_build_object(
    'reads', true,
    'writes', true,
    'provisioning', true,
    'realtime', true,
    'notifications', false,
    'shadowInbox', true
  ),
  'rollout defaults preserve notification producer dependency and shadow reads'
);
select ok(
  not has_function_privilege('authenticated', 'public.provision_session_conversation_v2(jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.provision_session_conversation_v2(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.send_message_v2(jsonb)', 'EXECUTE'),
  'service provisioning and authenticated messaging privileges are separated'
);

select * from finish(true);
rollback;
