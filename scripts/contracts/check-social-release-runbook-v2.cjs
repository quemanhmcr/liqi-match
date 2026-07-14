#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const runbookPath = path.join(
  root,
  'docs/runbooks/core-v2-social-relationship-safety.md',
);
const packagePath = path.join(root, 'package.json');
const telemetryPath = path.join(
  root,
  'src/entities/social-relationship/social-telemetry.ts',
);
const coordinatorTestPath = path.join(
  root,
  'src/entities/social-relationship/__tests__/social-command-coordinator.test.ts',
);
const evidenceTestPath = path.join(
  root,
  'src/features/messages/__tests__/message-report-evidence-workflow.test.ts',
);
const runbook = fs.readFileSync(runbookPath, 'utf8');
const telemetry = fs.readFileSync(telemetryPath, 'utf8');
const coordinatorTest = fs.readFileSync(coordinatorTestPath, 'utf8');
const evidenceTest = fs.readFileSync(evidenceTestPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const normalizedRunbook = runbook.replace(/\s+/g, ' ').toLowerCase();

const requiredHeadings = [
  '## Scope and authority',
  '## Migration order',
  '## Mandatory source gate',
  '## Live database verification',
  '## Feature gates and rollout order',
  '## Consumer checkpoint evidence',
  '## Canonical block parity',
  '## Two-account staging journey',
  '## Block revocation latency',
  '## Message report evidence checks',
  '## Client telemetry contract',
  '## Health checks',
  '## Rollback drill',
  '## Release evidence record',
];
for (const heading of requiredHeadings) {
  if (!runbook.includes(heading)) {
    throw new Error(`Social V2 runbook is missing heading: ${heading}`);
  }
}

const requiredMarkers = [
  'private.social_authority_config_v2',
  'reads_enabled',
  'writes_enabled',
  'legacy_block_shadow_reads_enabled',
  'legacy_block_dual_write',
  'legacy_block_mapping_missing',
  'report_submission_completed',
  'player.blocked.v2',
  'S1.2',
  'S1.3',
  'S1.4',
  'Invite-only enforcement is not sufficient',
  'below five seconds',
  'retry evidence only',
  'does not duplicate `reportId`',
  'supabase db reset',
  'supabase db lint',
  'supabase test db',
  'Never repair rollback by deleting canonical history',
  'social.command.started',
  'social.command.succeeded',
  'social.command.failed',
  'social.report_evidence.completed',
  'social.report_evidence.pending',
  'social.report_evidence.persistence_failed',
];
for (const marker of requiredMarkers) {
  if (!normalizedRunbook.includes(marker.toLowerCase())) {
    throw new Error(`Social V2 runbook is missing release marker: ${marker}`);
  }
}

for (const migration of [
  '202607140052',
  '202607140053',
  '202607140055',
  '202607140056',
  '202607140057',
  '202607140061',
  '202607140062',
  '202607141255',
  '202607141310',
  '202607141311',
  '202607142100',
]) {
  if (!runbook.includes(migration)) {
    throw new Error(`Social V2 runbook is missing migration ${migration}.`);
  }
}

if (!/set writes_enabled = false[\s\S]*where singleton;/i.test(runbook)) {
  throw new Error('Rollback must disable Social mutations first.');
}
if (
  !/set reads_enabled = false,[\s\S]*legacy_block_shadow_reads_enabled = true/i.test(
    runbook,
  )
) {
  throw new Error(
    'Rollback must document the legacy block read compatibility seam.',
  );
}
if (
  /drop table|truncate table|delete from public\.social_relationships_v2/i.test(
    runbook,
  )
) {
  throw new Error('Social V2 rollback must never delete canonical history.');
}
if (
  !/canonical_only[\s\S]*legacy_only/i.test(runbook) ||
  !/public\.player_blocks_v2[\s\S]*public\.blocks/i.test(runbook)
) {
  throw new Error(
    'Runbook must contain a directional canonical/legacy parity query.',
  );
}

for (const event of [
  'social.command.started',
  'social.command.succeeded',
  'social.command.failed',
  'social.report_evidence.completed',
  'social.report_evidence.pending',
  'social.report_evidence.persistence_failed',
]) {
  if (!telemetry.includes(`'${event}'`)) {
    throw new Error(`Social telemetry contract is missing ${event}.`);
  }
}
for (const coverage of [
  'emits privacy-safe command lifecycle telemetry across timeout and replay',
  'does not let a telemetry sink failure change command authority',
]) {
  if (!coordinatorTest.includes(coverage)) {
    throw new Error(
      `Social command telemetry coverage is missing: ${coverage}`,
    );
  }
}
for (const coverage of [
  'emits pending then retry-completed evidence telemetry without sensitive identifiers',
  'emits a persistence failure without turning the report receipt into failure',
]) {
  if (!evidenceTest.includes(coverage)) {
    throw new Error(`Evidence telemetry coverage is missing: ${coverage}`);
  }
}

const script = packageJson.scripts?.['social-release:check'];
if (script !== 'node scripts/contracts/check-social-release-runbook-v2.cjs') {
  throw new Error(
    'package.json must expose the exact social-release:check command.',
  );
}
if (
  !packageJson.scripts?.['task:check']?.includes('npm run social-release:check')
) {
  throw new Error(
    'task:check must execute the Social V2 release runbook gate.',
  );
}

console.log('Core V2 Social release/rollback runbook check passed.');
