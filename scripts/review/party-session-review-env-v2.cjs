#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  E2E_DISPOSABLE_PROJECT,
  assertLinkedProjectTarget,
  requireExplicitProjectTarget,
} = require('../supabase/project-registry.cjs');

const SUPABASE_CLI = 'supabase@2.109.1';
const ACTIONS = new Set(['status', 'enable-review', 'disable-writes']);

function parseArguments(argv) {
  const action = argv[0];
  if (!ACTIONS.has(action)) {
    throw new Error(
      'Usage: party-session-review-env-v2.cjs <status|enable-review|disable-writes> --target e2e-disposable',
    );
  }
  const project = requireExplicitProjectTarget(argv, 'e2e-disposable');
  return { action, project };
}

function resolveNpxInvocation() {
  if (process.platform !== 'win32') return { command: 'npx', prefix: [] };
  const candidates = [
    process.env.npm_execpath
      ? path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js')
      : null,
    path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npx-cli.js',
    ),
  ].filter(Boolean);
  const npxCli = candidates.find((candidate) => fs.existsSync(candidate));
  if (!npxCli) throw new Error('Unable to locate npx-cli.js on Windows.');
  return { command: process.execPath, prefix: [npxCli] };
}

function sqlFor(action) {
  const status = `
select jsonb_build_object(
  'readsEnabled', reads_enabled,
  'creationWritesEnabled', creation_writes_enabled,
  'mutationWritesEnabled', mutation_writes_enabled,
  'reconciliationWritesEnabled', reconciliation_writes_enabled,
  'updatedAt', updated_at
) as party_session_review_config
from private.party_session_config_v2
where singleton;
`;
  if (action === 'status') return status;
  if (action === 'enable-review') {
    return `
begin;
update private.party_session_config_v2
set reads_enabled = true, updated_at = now()
where singleton;
update private.party_session_config_v2
set reconciliation_writes_enabled = true, updated_at = now()
where singleton;
update private.party_session_config_v2
set mutation_writes_enabled = true, updated_at = now()
where singleton;
update private.party_session_config_v2
set creation_writes_enabled = true, updated_at = now()
where singleton;
commit;
${status}`;
  }
  return `
begin;
update private.party_session_config_v2
set creation_writes_enabled = false,
    mutation_writes_enabled = false,
    reconciliation_writes_enabled = false,
    reads_enabled = true,
    updated_at = now()
where singleton;
commit;
${status}`;
}

function runQuery(repoRoot, sql) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liqi-party-review-'));
  const sqlPath = path.join(tempDir, 'review-config.sql');
  fs.writeFileSync(sqlPath, sql, 'utf8');
  try {
    const invocation = resolveNpxInvocation();
    const result = spawnSync(
      invocation.command,
      [
        ...invocation.prefix,
        '--yes',
        SUPABASE_CLI,
        'db',
        'query',
        '--linked',
        '--file',
        sqlPath,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Supabase CLI failed with exit code ${result.status}.`);
    }
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const { action, project } = parseArguments(process.argv.slice(2));
  const linked = assertLinkedProjectTarget(repoRoot, 'e2e-disposable');
  console.log(
    `PARTY_SESSION_REVIEW_ENV action=${action} target=${project.target} project_name=${project.projectName} project_ref=${linked.projectRef} cli=${SUPABASE_CLI}`,
  );
  runQuery(repoRoot, sqlFor(action));
}

try {
  main();
} catch (error) {
  console.error(`PARTY_SESSION_REVIEW_ENV_FAIL ${error.message}`);
  process.exitCode = 1;
}
