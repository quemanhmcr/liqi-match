-- Authoritative post-session surface. Mobile receives actor-specific confirmation
-- and endorsement eligibility without inferring quorum or duplicate state.

create or replace function private.participation_confirmation_snapshot_v2(
  p_confirmation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'confirmationId', confirmations.id,
    'sessionId', confirmations.session_id,
    'playerId', confirmations.player_id,
    'status', confirmations.status,
    'reasonCode', confirmations.reason_code,
    'version', confirmations.version,
    'confirmedAt', confirmations.confirmed_at
  )
  from public.session_participation_confirmations_v2 confirmations
  where confirmations.id = p_confirmation_id;
$$;

create or replace function public.get_session_feedback_surface_v2(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.trust_authority_config_v2;
  actor_context jsonb;
  actor_player_id_value uuid;
  outcome_row public.session_outcomes_v2;
  actor_confirmation_row public.session_participation_confirmations_v2;
  confirmed_player_ids_value uuid[];
  endorsement_target_player_ids_value uuid[];
  all_confirmed_value boolean;
begin
  if p_session_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'sessionId is required.'
    );
  end if;
  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust reads are disabled.',
      true
    );
  end if;
  actor_context := private.resolve_trust_actor_v2(false, false);
  actor_player_id_value := (actor_context ->> 'playerId')::uuid;

  select outcomes.* into outcome_row
  from public.session_outcomes_v2 outcomes
  where outcomes.session_id = p_session_id;
  if outcome_row.id is null then
    return null;
  end if;
  if not actor_player_id_value = any(outcome_row.participant_player_ids) then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only session participants can read this feedback surface.'
    );
  end if;

  select confirmations.* into actor_confirmation_row
  from public.session_participation_confirmations_v2 confirmations
  where confirmations.outcome_id = outcome_row.id
    and confirmations.player_id = actor_player_id_value;

  select coalesce(array_agg(confirmations.player_id order by confirmations.player_id), '{}'::uuid[])
  into confirmed_player_ids_value
  from public.session_participation_confirmations_v2 confirmations
  where confirmations.outcome_id = outcome_row.id
    and confirmations.status = 'confirmed';
  all_confirmed_value := not exists (
    select 1
    from unnest(outcome_row.participant_player_ids) participants(player_id)
    where not participants.player_id = any(confirmed_player_ids_value)
  );

  if outcome_row.state = 'recorded'
    and actor_confirmation_row.status = 'confirmed'
    and all_confirmed_value then
    select coalesce(array_agg(participants.player_id order by participants.player_id), '{}'::uuid[])
    into endorsement_target_player_ids_value
    from unnest(outcome_row.participant_player_ids) participants(player_id)
    where participants.player_id <> actor_player_id_value
      and participants.player_id = any(confirmed_player_ids_value)
      and not exists (
        select 1
        from public.player_endorsements_v2 endorsements
        where endorsements.outcome_id = outcome_row.id
          and endorsements.actor_player_id = actor_player_id_value
          and endorsements.target_player_id = participants.player_id
      );
  else
    endorsement_target_player_ids_value := '{}'::uuid[];
  end if;

  return jsonb_build_object(
    'actorPlayerId', actor_player_id_value,
    'actorConfirmation', case
      when actor_confirmation_row.id is null then null
      else private.participation_confirmation_snapshot_v2(actor_confirmation_row.id)
    end,
    'allParticipantsConfirmed', all_confirmed_value,
    'confirmedPlayerIds', confirmed_player_ids_value,
    'endorsementTargetPlayerIds', endorsement_target_player_ids_value,
    'outcome', private.session_outcome_snapshot_v2(outcome_row.id)
  );
end;
$$;

revoke execute on function private.participation_confirmation_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_session_feedback_surface_v2(uuid)
  from public, anon;
grant execute on function public.get_session_feedback_surface_v2(uuid)
  to authenticated;

comment on function public.get_session_feedback_surface_v2(uuid) is
  'Actor-specific authoritative feedback surface. Endorsement targets are emitted only after full confirmed participation and exclude duplicates.';
