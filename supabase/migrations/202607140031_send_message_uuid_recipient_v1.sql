-- PostgreSQL does not define min(uuid). Select the deterministic recipient
-- by UUID ordering while using a window count to enforce exactly two members.

create or replace function public.send_message_v1(
  p_conversation_id uuid,
  p_client_message_id text,
  p_content jsonb,
  p_client_created_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid;
  actor_snapshot private.messaging_player_snapshot_v1;
  conversation public.conversations%rowtype;
  existing_message public.messages%rowtype;
  created_message public.messages%rowtype;
  media_asset public.media_assets%rowtype;
  recipient_player_id uuid;
  actor_member public.conversation_participants_v1%rowtype;
  recipient_member public.conversation_participants_v1%rowtype;
  recipient_count integer;
  content_kind public.message_content_kind_v1;
  canonical_content jsonb;
  compatibility_body text;
  media_asset_id uuid;
  request_fingerprint text;
  next_sequence bigint;
  message_event_id uuid;
  unread_count integer;
begin
  actor_snapshot := private.require_authenticated_messaging_snapshot_v1(false);
  actor_account_id := auth.uid();

  if p_conversation_id is null
    or p_correlation_id is null
    or p_client_created_at is null
    or p_client_message_id is null
    or char_length(p_client_message_id) not between 16 and 128
    or p_client_message_id !~ '^[A-Za-z0-9._:-]+$'
    or jsonb_typeof(p_content) is distinct from 'object'
  then
    raise exception 'Invalid send-message command'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  content_kind := (p_content ->> 'kind')::public.message_content_kind_v1;

  case content_kind
    when 'text' then
      compatibility_body := btrim(coalesce(p_content ->> 'text', ''));
      if char_length(compatibility_body) not between 1 and 4000 then
        raise exception 'Text message must contain 1 to 4000 characters'
          using errcode = '22023', detail = 'validation_failed';
      end if;
      canonical_content := jsonb_build_object(
        'kind', 'text',
        'text', compatibility_body
      );
    when 'media' then
      begin
        media_asset_id := (p_content ->> 'assetId')::uuid;
      exception
        when others then
          raise exception 'Invalid media asset identifier'
            using errcode = '22023', detail = 'validation_failed';
      end;

      compatibility_body := nullif(btrim(coalesce(p_content ->> 'caption', '')), '');
      if compatibility_body is not null and char_length(compatibility_body) > 4000 then
        raise exception 'Media caption is too long'
          using errcode = '22023', detail = 'validation_failed';
      end if;

      canonical_content := jsonb_strip_nulls(
        jsonb_build_object(
          'kind', 'media',
          'assetId', media_asset_id,
          'caption', compatibility_body
        )
      );
      compatibility_body := coalesce(
        compatibility_body,
        format('[media:%s]', media_asset_id)
      );
    else
      raise exception 'Clients may send only text or media messages'
        using errcode = '22023', detail = 'validation_failed';
  end case;

  request_fingerprint := private.request_fingerprint_v1(
    jsonb_build_object(
      'conversationId', p_conversation_id,
      'content', canonical_content
    )
  );

  select * into existing_message
  from public.messages
  where conversation_id = p_conversation_id
    and sender_player_id_v1 = actor_snapshot.player_id
    and client_message_id_v1 = p_client_message_id
    and schema_version_v1 = 1;

  if existing_message.id is not null then
    if existing_message.request_fingerprint_v1 is distinct from request_fingerprint then
      raise exception 'Client message ID was reused with different content'
        using errcode = '23505', detail = 'idempotency_conflict';
    end if;

    return jsonb_build_object(
      'message', private.message_json_v1(existing_message),
      'repeated', true
    );
  end if;

  actor_snapshot := private.require_authenticated_messaging_snapshot_v1(true);
  if auth.uid() is distinct from actor_account_id then
    raise exception 'Authenticated principal changed during send'
      using errcode = '40001', detail = 'principal_changed';
  end if;

  if not private.conversation_writes_enabled_v1() then
    raise exception 'Conversation writes are disabled'
      using errcode = '55000', detail = 'conversation_writes_disabled';
  end if;

  perform private.assert_messaging_allowed_v1(actor_snapshot);

  if content_kind = 'media' and not private.image_messages_enabled_v1() then
    raise exception 'Image messages are disabled'
      using errcode = '55000', detail = 'image_messages_disabled';
  end if;

  select * into conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if conversation.id is null then
    raise exception 'Conversation not found'
      using errcode = 'P0002', detail = 'conversation_not_found';
  end if;

  if conversation.state_v1 is distinct from 'open' then
    raise exception 'Conversation is not open'
      using errcode = '42501', detail = 'conversation_closed';
  end if;

  select * into actor_member
  from public.conversation_participants_v1
  where conversation_id = conversation.id
    and player_id = actor_snapshot.player_id;

  if actor_member.conversation_id is null
    or actor_member.profile_id is distinct from actor_snapshot.profile_id
  then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  select * into existing_message
  from public.messages
  where conversation_id = p_conversation_id
    and sender_player_id_v1 = actor_snapshot.player_id
    and client_message_id_v1 = p_client_message_id
    and schema_version_v1 = 1;

  if existing_message.id is not null then
    if existing_message.request_fingerprint_v1 is distinct from request_fingerprint then
      raise exception 'Client message ID was reused with different content'
        using errcode = '23505', detail = 'idempotency_conflict';
    end if;

    return jsonb_build_object(
      'message', private.message_json_v1(existing_message),
      'repeated', true
    );
  end if;

  if content_kind = 'media' then
    select * into media_asset
    from public.media_assets
    where id = media_asset_id
    for share;

    if media_asset.id is null
      or media_asset.owner_id is distinct from actor_member.legacy_profile_id
      or media_asset.purpose is distinct from 'chat_attachment'
      or media_asset.visibility is distinct from 'conversation_members'
      or media_asset.status is distinct from 'ready'
      or media_asset.moderation_status is distinct from 'approved'
      or media_asset.deleted_at is not null
    then
      raise exception 'Media asset is not ready for this conversation'
        using errcode = '42501', detail = 'media_asset_unavailable';
    end if;
  end if;

  select member.player_id, count(*) over ()::integer
    into recipient_player_id, recipient_count
  from public.conversation_participants_v1 as member
  where member.conversation_id = conversation.id
    and member.player_id <> actor_snapshot.player_id
  order by member.player_id
  limit 1;

  if recipient_count <> 1 or recipient_player_id is null then
    raise exception 'Conversation requires exactly one recipient'
      using errcode = '22023', detail = 'conversation_contract_violation';
  end if;

  select * into recipient_member
  from public.conversation_participants_v1
  where conversation_id = conversation.id
    and player_id = recipient_player_id
  for update;

  next_sequence := conversation.last_sequence_v1 + 1;

  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    schema_version_v1,
    sender_player_id_v1,
    client_message_id_v1,
    sequence_v1,
    content_kind_v1,
    content_v1,
    media_asset_id_v1,
    correlation_id_v1,
    request_fingerprint_v1
  )
  values (
    conversation.id,
    actor_member.legacy_profile_id,
    compatibility_body,
    1,
    actor_snapshot.player_id,
    p_client_message_id,
    next_sequence,
    content_kind,
    canonical_content,
    media_asset_id,
    p_correlation_id,
    request_fingerprint
  )
  returning * into created_message;

  update public.conversations
  set last_sequence_v1 = next_sequence,
      last_message_at = created_message.created_at,
      version_v1 = version_v1 + 1
  where id = conversation.id;

  unread_count := private.conversation_unread_count_v1(
    conversation.id,
    recipient_player_id,
    recipient_member.last_read_sequence
  );

  message_event_id := private.enqueue_contract_event_v1(
    'message.sent.v1',
    'conversation',
    conversation.id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'message', private.message_json_v1(created_message),
      'recipientPlayerIds', jsonb_build_array(recipient_player_id)
    ),
    format('message.sent.v1:%s', created_message.id)
  );

  perform private.enqueue_contract_event_v1(
    'notification.requested.v1',
    'player',
    recipient_player_id,
    p_correlation_id,
    message_event_id,
    jsonb_build_object(
      'recipientPlayerId', recipient_player_id,
      'reasonCode', 'message_received',
      'target', jsonb_build_object(
        'kind', 'conversation',
        'conversationId', conversation.id,
        'messageId', created_message.id,
        'senderPlayerId', actor_snapshot.player_id,
        'authoritativeUnreadCount', unread_count
      )
    ),
    format(
      'notification.requested.v1:message_received:%s:%s',
      created_message.id,
      recipient_player_id
    )
  );

  return jsonb_build_object(
    'message', private.message_json_v1(created_message),
    'repeated', false
  );
exception
  when invalid_text_representation then
    raise exception 'Invalid send-message content kind'
      using errcode = '22023', detail = 'validation_failed';
end;
$$;
