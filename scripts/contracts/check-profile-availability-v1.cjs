#!/usr/bin/env node
const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607140042_update_player_profile_availability_v1.sql';
const testPath =
  'supabase/tests/database/player_profile_availability_v1.test.sql';
const contractPath = 'contracts/core-v1/profile/player-profile-availability.ts';
const commandPath =
  'src/features/profile/edit/services/commands/save-profile-availability.ts';
const coordinatorPath =
  'src/features/profile/edit/services/profile-edit-coordinator.ts';
const readPath =
  'src/features/profile/edit/services/profile-edit-read-service.ts';

const migration = fs.readFileSync(migrationPath, 'utf8');
const test = fs.readFileSync(testPath, 'utf8');
const contract = fs.readFileSync(contractPath, 'utf8');
const command = fs.existsSync(commandPath)
  ? fs.readFileSync(commandPath, 'utf8')
  : '';
const coordinator = fs.readFileSync(coordinatorPath, 'utf8');
const readService = fs.readFileSync(readPath, 'utf8');
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

requireInvariant(
  /PlayerProfileAvailabilitySnapshotV1Schema/.test(contract) &&
    /UpdatePlayerProfileAvailabilityCommandV1Schema/.test(contract) &&
    /UpdatePlayerProfileAvailabilityResultV1Schema/.test(contract) &&
    /Canonical availability slots cannot overlap/.test(contract),
  'Availability must publish strict read, command, replay, and overlap contracts.',
);
requireInvariant(
  /create or replace function public\.get_own_player_profile_availability_v1\(\)/i.test(
    migration,
  ) &&
    /create or replace function public\.update_player_profile_availability_v1\(\s*command jsonb\s*\)/i.test(
      migration,
    ),
  'Availability must have one authoritative read RPC and one command RPC.',
);
requireInvariant(
  /private\.begin_command_v1\(/.test(migration) &&
    /private\.finish_command_v1\(/.test(migration) &&
    !/command_idempotency_v1/.test(migration),
  'Availability must use the shared command receipt authority.',
);
requireInvariant(
  /profile_version_conflict/.test(migration) &&
    /version = version \+ 1/.test(migration),
  'Availability must use optimistic canonical profile versioning.',
);
requireInvariant(
  /when end_minute_value = 1440 then time '23:59:59'/.test(migration) &&
    /when slots\.ends_at = time '23:59:59' then 1440/.test(migration),
  'Availability must preserve the canonical end-of-day minute through the legacy bridge.',
);
requireInvariant(
  /delete from public\.availability_slots/.test(migration) &&
    /insert into public\.availability_slots/.test(migration) &&
    /update public\.profiles\s+set timezone = timezone_value/i.test(migration),
  'Availability projection writes must occur inside the command transaction.',
);
requireInvariant(
  /'player\.profile_updated\.v1'/.test(migration) &&
    /'profileVersion', canonical_profile_row\.version/.test(migration),
  'Availability must emit the canonical profile-updated event with the new version.',
);
requireInvariant(
  /grant execute on function public\.get_own_player_profile_availability_v1\(\)[\s\S]*to authenticated, service_role/i.test(
    migration,
  ) &&
    /grant execute on function public\.update_player_profile_availability_v1\(jsonb\)[\s\S]*to authenticated, service_role/i.test(
      migration,
    ),
  'Availability RPC privileges must be explicit and authenticated-only.',
);
requireInvariant(
  /select plan\(26\)/i.test(test) &&
    /profile_version_conflict/.test(test) &&
    /idempotency_key_reused/.test(test) &&
    /player_suspended/.test(test),
  'Availability pgTAP must cover version, replay, idempotency, and lifecycle failures.',
);

if (command) {
  requireInvariant(
    /rpc\/update_player_profile_availability_v1/.test(command) &&
      /UpdatePlayerProfileAvailabilityCommandV1Schema\.parse/.test(command) &&
      /UpdatePlayerProfileAvailabilityResultV1Schema\.parse/.test(command),
    'Profile Edit Availability command must validate the exact Core V1 request and response.',
  );
  requireInvariant(
    /saveProfileAvailability/.test(coordinator) &&
      !/Availability đang chờ primitive dùng chung/.test(coordinator),
    'Profile Edit coordinator must call the authoritative Availability command.',
  );
  requireInvariant(
    /rpc\/get_own_player_profile_availability_v1/.test(readService) &&
      /PlayerProfileAvailabilitySnapshotV1Schema\.parse/.test(readService),
    'Profile Edit read service must consume the authoritative Availability snapshot.',
  );
}

const plan = Number((test.match(/select plan\((\d+)\)/i) || [])[1]);
const assertions = (
  test.match(
    /select\s+(?:is|isnt|ok|throws_ok|throws_like|lives_ok|has_table|has_column|has_function|has_function_privilege)\s*\(/gi,
  ) || []
).length;
requireInvariant(
  plan === assertions,
  `Availability pgTAP plan must equal assertion count (${plan} != ${assertions}).`,
);

if (failures.length) {
  console.error(
    `Profile Availability v1 check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Profile Availability v1 check passed (${assertions} pgTAP assertions).`,
);
