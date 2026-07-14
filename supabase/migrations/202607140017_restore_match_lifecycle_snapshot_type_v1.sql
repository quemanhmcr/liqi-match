-- Compatibility type consumed by Match Authority functions in migrations 025+
-- after the split identity/lifecycle/profile provider cutover.

create type private.player_lifecycle_snapshot_v1 as (
  account_id uuid,
  player_id uuid,
  profile_id uuid,
  state text,
  discoverable boolean,
  profile_version integer,
  lifecycle_version integer,
  updated_at timestamptz
);
