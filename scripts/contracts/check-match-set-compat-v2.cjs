const fs = require('node:fs');
const PgQueryModule = require('pg-query-emscripten').default;

const migration = fs.readFileSync(
  'supabase/migrations/202607141461_match_set_v1_read_v2_write_compat.sql',
  'utf8',
);
const repository = fs.readFileSync(
  'src/entities/match-set/supabase-match-set-repository.ts',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const fn of [
  'public.create_set_invite_compat_v2',
  'public.request_set_join_compat_v2',
  'private.match_set_compat_source_event_v2',
]) {
  requireInvariant(
    migration.includes(`create or replace function ${fn}`),
    `missing ${fn}`,
  );
}
requireInvariant(
  migration.includes('receipt_value := public.invite_to_set_v2') &&
    migration.includes('receipt_value := public.request_set_join_v2'),
  'compatibility writes must delegate only to Core V2 authority',
);
requireInvariant(
  !/insert\s+into\s+public\.match_set_(?:invites|join_requests)_v1/i.test(
    migration,
  ) && !/update\s+public\.match_sets_v1/i.test(migration),
  'compatibility wrappers must never dual-write V1 Set tables',
);
requireInvariant(
  migration.includes("'set.invite_created.v2'") &&
    migration.includes("'set.join_requested.v2'") &&
    migration.includes("'{eventIds,0}'") &&
    migration.includes("'{payload,inviteId}'") &&
    migration.includes("'{payload,joinRequestId}'"),
  'legacy DTO IDs must come from immutable Core V2 source events',
);
requireInvariant(
  migration.includes("'repeated', coalesce((receipt_value ->> 'repeated')") &&
    migration.includes("'state', 'pending'"),
  'compatibility receipts must preserve replay semantics and V1 pending state',
);
requireInvariant(
  migration.includes('from public, anon;') &&
    migration.includes('to authenticated, service_role;'),
  'compatibility RPC grants must remain authenticated-only',
);
requireInvariant(
  repository.includes("this.rpc('list_discovery_sets_v1'") &&
    repository.includes("this.rpc('create_set_invite_compat_v2'") &&
    repository.includes("this.rpc('request_set_join_compat_v2'"),
  'mobile repository must retain V1 reads and route writes to V2 adapters',
);
requireInvariant(
  repository.includes("idempotencyScope: 'match-set'") &&
    repository.includes('p_audit: metadata.audit'),
  'mobile V2 writes must carry secure Core V2 audit metadata',
);

(async () => {
  const parser = await new PgQueryModule();
  const parsed = parser.parse(migration);
  if (parsed.error)
    failures.push(`migration SQL parse failed: ${parsed.error.message}`);
  if (failures.length) {
    console.error('Match Set compatibility v2 check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Match Set V1-read/V2-write compatibility check passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
