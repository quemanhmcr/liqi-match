-- Adapt the authoritative JSON lifecycle provider payload used by Discovery to
-- the canonical Match Authority eligibility assertion without duplicating
-- lifecycle semantics.

create or replace function private.assert_discovery_eligible_v1(
  p_snapshot jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_snapshot is null then
    raise exception 'Player lifecycle snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  perform private.assert_discovery_eligible_v1(
    row(
      null,
      null,
      null,
      p_snapshot ->> 'state',
      (p_snapshot ->> 'discoverable')::boolean,
      null,
      null,
      null
    )::private.player_lifecycle_snapshot_v1
  );
end;
$$;

revoke execute on function private.assert_discovery_eligible_v1(jsonb)
  from public, anon, authenticated;
grant execute on function private.assert_discovery_eligible_v1(jsonb)
  to service_role;
