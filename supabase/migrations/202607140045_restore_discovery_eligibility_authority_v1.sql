-- Restore the canonical Discovery eligibility authority after migration 027
-- accidentally replaced it with a JSONB-to-composite adapter whose typed target
-- was absent. The JSONB implementation remains the single semantic engine; the
-- typed provider seam is a compatibility adapter only.

create or replace function private.assert_discovery_eligible_v1(
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id_value uuid;
  lifecycle_state_value text;
  lifecycle_version_value bigint;
begin
  if p_snapshot is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The player identity is unavailable.'
    );
  end if;

  begin
    player_id_value := (p_snapshot ->> 'playerId')::uuid;
    lifecycle_state_value := p_snapshot ->> 'state';
    lifecycle_version_value := (p_snapshot ->> 'version')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'internal_error',
      'The lifecycle provider returned an invalid snapshot.'
    );
  end;

  if private.is_player_discovery_eligible_v1(player_id_value) then
    if private.is_match_intent_lifecycle_projection_ready_v1(
      player_id_value,
      lifecycle_version_value
    ) then
      return;
    end if;

    perform private.raise_core_error_v1(
      'service_unavailable',
      'Player lifecycle eligibility projection is pending.',
      true,
      jsonb_build_object('lifecycleVersion', lifecycle_version_value)
    );
  end if;

  if lifecycle_state_value = 'suspended' then
    perform private.raise_core_error_v1(
      'player_suspended',
      'The player is suspended.'
    );
  elsif lifecycle_state_value = 'deleting' then
    perform private.raise_core_error_v1(
      'player_deleting',
      'The player is being deleted.'
    );
  elsif lifecycle_state_value = 'deleted' then
    perform private.raise_core_error_v1(
      'player_deleted',
      'The player has been deleted.'
    );
  elsif lifecycle_state_value <> 'active' then
    perform private.raise_core_error_v1(
      'lifecycle_not_active',
      'The player lifecycle must be active.'
    );
  else
    perform private.raise_core_error_v1(
      'not_discoverable',
      'The player is not discoverable.'
    );
  end if;
end;
$$;

create or replace function private.assert_discovery_eligible_v1(
  p_snapshot private.player_lifecycle_snapshot_v1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_snapshot is null then
    perform private.assert_discovery_eligible_v1(null::jsonb);
    return;
  end if;

  perform private.assert_discovery_eligible_v1(
    jsonb_build_object(
      'playerId', p_snapshot.player_id,
      'state', p_snapshot.state,
      'discoverable', p_snapshot.discoverable,
      'version', p_snapshot.lifecycle_version
    )
  );
end;
$$;

revoke all on function private.assert_discovery_eligible_v1(jsonb)
  from public, anon, authenticated;
revoke all on function private.assert_discovery_eligible_v1(
  private.player_lifecycle_snapshot_v1
) from public, anon, authenticated;
grant execute on function private.assert_discovery_eligible_v1(jsonb)
  to service_role;
grant execute on function private.assert_discovery_eligible_v1(
  private.player_lifecycle_snapshot_v1
) to service_role;
