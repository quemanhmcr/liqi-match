const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607141400_core_v2_trust_outcome_foundation.sql';
const databaseTestPath =
  'supabase/tests/database/core_v2_trust_outcome_foundation.test.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const databaseTest = fs.readFileSync(databaseTestPath, 'utf8');
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

const publicTables = [
  'session_outcomes_v2',
  'session_participation_confirmations_v2',
  'player_endorsements_v2',
  'player_reputation_ledger_v2',
  'player_reputation_projection_v2',
  'repeat_teammate_relationships_v2',
  'activity_items_v2',
  'engagement_preferences_v2',
  'repeat_play_requests_v2',
];

for (const table of publicTables) {
  requireInvariant(
    migration.includes(`create table public.${table}`),
    `${table} must exist in the canonical trust foundation`,
  );
  requireInvariant(
    migration.includes(
      `alter table public.${table} enable row level security;`,
    ),
    `${table} must enable RLS explicitly`,
  );
  requireInvariant(
    migration.includes(
      `revoke all on public.${table} from public, anon, authenticated;`,
    ),
    `${table} must deny direct client table access`,
  );
}

requireInvariant(
  !migration.includes('auth.uid() as player_id') &&
    migration.includes('public.resolve_player_identity_v1') &&
    migration.includes('public.get_player_lifecycle_snapshot_v1'),
  'Trust actor resolution must reuse Core V1 identity and lifecycle authority',
);
requireInvariant(
  migration.includes('source_event_id uuid not null unique') &&
    migration.includes('source_session_version bigint not null') &&
    migration.includes('participant_player_ids uuid[] not null'),
  'Outcome facts must retain the canonical completed-event identity, version, and participants',
);
requireInvariant(
  migration.includes("verification = 'participant_quorum'") === false,
  'Trust foundation must not define or re-confirm Senior 2 session quorum semantics',
);
requireInvariant(
  migration.includes("'reputation_ledger_immutable'") &&
    migration.includes('player_reputation_ledger_v2_immutable') &&
    migration.includes('before update or delete'),
  'Reputation ledger must reject UPDATE and DELETE',
);
requireInvariant(
  migration.includes('private.rebuild_player_reputation_projection_v2') &&
    migration.includes('from public.player_reputation_ledger_v2 entries') &&
    migration.includes('where entries.player_id = p_player_id'),
  'Projection rebuild must derive exclusively from the immutable ledger',
);
requireInvariant(
  migration.includes("'participation_confirmation'") &&
    migration.includes("'endorsement'") &&
    migration.includes("'repeat_teammate'") &&
    migration.includes("'moderation_action'") &&
    !/create type public\.reputation_source_type_v2[\s\S]*?'report'/i.test(
      migration,
    ) &&
    !/create type public\.reputation_source_type_v2[\s\S]*?'block'/i.test(
      migration,
    ) &&
    !/create type public\.reputation_source_type_v2[\s\S]*?'friendship'/i.test(
      migration,
    ),
  'Raw report, block, and friendship facts must never be reputation ledger sources',
);
requireInvariant(
  migration.includes(
    'public_projection_enabled boolean not null default false',
  ) &&
    migration.includes('private.social_trust_visibility_decision_v2') &&
    migration.includes("visibility_decision ->> 'canViewTrust'"),
  'Cross-player projection must be shadow-hidden and consume Social privacy authority',
);
requireInvariant(
  migration.includes(
    'feedback_prompts_enabled boolean not null default true',
  ) &&
    migration.includes('activity_enabled boolean not null default true') &&
    migration.includes('repeat_play_enabled boolean not null default true'),
  'Feedback, activity, and repeat-play must have independent rollback flags',
);
requireInvariant(
  !/grant\s+(?:insert|update|delete|all)[\s\S]{0,120}\s+to\s+authenticated/i.test(
    migration,
  ),
  'Authenticated clients must not receive direct authoritative write grants',
);
const securityDefinerBlocks = migration.split(/security definer/i).slice(1);
requireInvariant(
  securityDefinerBlocks.length > 0 &&
    securityDefinerBlocks.every((block) =>
      /^\s*set search_path = ''/i.test(block),
    ),
  'Every security-definer function must pin an empty search_path',
);
requireInvariant(
  migration.includes('cardinality(teammate_player_ids) between 1 and 4'),
  'Repeat requests must fit Senior 2 capacity: requester plus at most four teammates',
);

const assertionCount = (
  databaseTest.match(
    /select\s+(?:has_table|is|isnt|ok|lives_ok|throws_ok|throws_like)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);
requireInvariant(
  databaseTest.includes('rebuild projection equals incremental projection') &&
    databaseTest.includes(
      'authenticated clients cannot directly edit authoritative stats',
    ) &&
    databaseTest.includes(
      'cross-player trust remains hidden while shadow flag is disabled',
    ),
  'pgTAP must prove rebuild parity, client write denial, and shadow visibility rollback',
);

if (failures.length) {
  console.error(
    `Core V2 trust authority check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Core V2 trust authority check passed (${publicTables.length} RLS tables, ${assertionCount} pgTAP assertions).`,
);
