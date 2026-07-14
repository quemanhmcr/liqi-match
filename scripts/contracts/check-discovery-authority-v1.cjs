const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140005_discovery_candidate_snapshot_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/discovery_candidate_snapshot_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  migration.includes('private.is_player_discovery_eligible_v1(candidate.id)'),
  'candidate eligibility must consume Mission 1 lifecycle authority',
);
requireInvariant(
  migration.includes("candidate_intent.state = 'active'") &&
    migration.includes('candidate_intent.expires_at > now()'),
  'candidate must own an unexpired active Match Intent',
);
requireInvariant(
  migration.includes('private.are_profiles_blocked'),
  'blocked relationships must be filtered server-side',
);
requireInvariant(
  migration.includes("coalesce(relationship.decision::text, 'none') <> 'pass'"),
  'passed candidates must be excluded from new snapshots',
);
requireInvariant(
  migration.includes('unique (snapshot_id, candidate_player_id)'),
  'one snapshot cannot contain a duplicate candidate',
);
requireInvariant(
  migration.includes('unique (snapshot_id, next_ordinal)'),
  'cursor retries must resolve to one stable cursor identity',
);
requireInvariant(
  !/\bp_offset\b/i.test(migration),
  'public pagination must not expose mutable offset semantics',
);
requireInvariant(
  migration.includes('snapshot_row.intent_version <> actor_intent.version'),
  'cursor must be invalidated when Match Intent version changes',
);
requireInvariant(
  migration.includes("'avatarAssetId'"),
  'candidate summaries must carry stable media asset identity',
);
requireInvariant(
  !/profile.*avatar.*discoverable|hero.*discoverable/i.test(migration),
  'Discovery must not infer lifecycle from profile completeness',
);

const assertionCount = (
  databaseTest.match(/select\s+(?:is|isnt|ok|throws_ok|throws_like)\s*\(/gi) ??
  []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

if (failures.length) {
  console.error(
    `Discovery Authority v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Discovery Authority v1 check passed (${assertionCount} pgTAP assertions).`,
);
