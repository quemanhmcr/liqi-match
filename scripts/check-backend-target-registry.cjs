#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  E2E_DISPOSABLE_PROJECT,
  STAGING_RUNTIME_PROJECT,
} = require('./supabase/project-registry.cjs');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

function envValues(relative) {
  const values = new Map();
  for (const rawLine of read(relative).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

requireInvariant(
  STAGING_RUNTIME_PROJECT.projectName === 'liqi-match-staging' &&
    STAGING_RUNTIME_PROJECT.projectRef === 'wngumhizuxtlhavbpxzy' &&
    STAGING_RUNTIME_PROJECT.allowMobileRuntime === true &&
    STAGING_RUNTIME_PROJECT.allowCloudDatabaseE2e === false &&
    STAGING_RUNTIME_PROJECT.allowReleaseEvidence === true &&
    STAGING_RUNTIME_PROJECT.disposable === false,
  'staging-runtime registry identity or permissions drifted',
);
requireInvariant(
  E2E_DISPOSABLE_PROJECT.projectRef === 'ibprkyemsuktfrdpxvza' &&
    E2E_DISPOSABLE_PROJECT.allowMobileRuntime === false &&
    E2E_DISPOSABLE_PROJECT.allowCloudDatabaseE2e === true &&
    E2E_DISPOSABLE_PROJECT.allowReleaseEvidence === false &&
    E2E_DISPOSABLE_PROJECT.disposable === true,
  'e2e-disposable registry identity or permissions drifted',
);

const localEnv = envValues('.env.example');
requireInvariant(
  localEnv.get('EXPO_PUBLIC_APPLICATION_RUNTIME_MODE') === 'simulation' &&
    localEnv.get('EXPO_PUBLIC_BACKEND_TARGET') === 'local-simulation' &&
    localEnv.get('EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF') === 'local',
  '.env.example must remain local-simulation only',
);
const stagingEnv = envValues('.env.staging.example');
requireInvariant(
  stagingEnv.get('EXPO_PUBLIC_APPLICATION_RUNTIME_MODE') === 'api' &&
    stagingEnv.get('EXPO_PUBLIC_BACKEND_TARGET') === 'staging-runtime' &&
    stagingEnv.get('EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF') ===
      STAGING_RUNTIME_PROJECT.projectRef &&
    stagingEnv.get('EXPO_PUBLIC_SUPABASE_URL') ===
      `https://${STAGING_RUNTIME_PROJECT.projectRef}.supabase.co`,
  '.env.staging.example must identify the real staging runtime exactly',
);
const productionEnv = envValues('.env.production.example');
requireInvariant(
  productionEnv.get('EXPO_PUBLIC_BACKEND_TARGET') === 'production-runtime' &&
    productionEnv.has('EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF'),
  '.env.production.example must require an explicit production target/ref',
);

const appConfig = read('app.config.ts');
const envSource = read('src/shared/config/env.ts');
requireInvariant(
  appConfig.includes(
    "import projectRegistry from './config/supabase-projects.json'",
  ) &&
    appConfig.includes('EXPO_PUBLIC_BACKEND_TARGET') &&
    appConfig.includes('EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF') &&
    appConfig.includes(
      'production-runtime cannot reuse staging or disposable E2E',
    ),
  'Expo config must derive and validate explicit backend target identity',
);
requireInvariant(
  envSource.includes("from './backend-projects'") &&
    envSource.includes(
      "value.EXPO_PUBLIC_BACKEND_TARGET === 'staging-runtime'",
    ) &&
    envSource.includes(
      'disposable E2E project is forbidden as a mobile runtime',
    ) &&
    envSource.includes(
      'production-runtime cannot reuse the staging or disposable E2E',
    ),
  'mobile environment parser must reject cross-role Supabase targets',
);

const cloudRunners = [
  'scripts/e2e/core-v2-cloud-db.cjs',
  'scripts/e2e/conversation-cloud-db-v2.cjs',
  'scripts/e2e/trust-return-loop-cloud-db-v2.cjs',
  'scripts/e2e/party-session-cloud-db-v2.cjs',
];
for (const relative of cloudRunners) {
  const source = read(relative);
  requireInvariant(
    source.includes('requireExplicitProjectTarget') &&
      source.includes('assertLinkedProjectTarget') &&
      source.includes("'e2e-disposable'") &&
      !source.includes("'staging-runtime'"),
    `${relative} must be hard-restricted to e2e-disposable`,
  );
}
for (const relative of [
  'scripts/e2e/return-loop-api-v1.cjs',
  'scripts/e2e/party-session-api-v2.cjs',
]) {
  const source = read(relative);
  requireInvariant(
    source.includes('assertUrlProjectTarget') &&
      source.includes("'e2e-disposable'") &&
      source.includes('API_E2E_TARGET'),
    `${relative} must verify SUPABASE_URL belongs to e2e-disposable`,
  );
}
const reviewController = read('scripts/review/party-session-review-env-v2.cjs');
requireInvariant(
  reviewController.includes('requireExplicitProjectTarget') &&
    reviewController.includes('assertLinkedProjectTarget') &&
    reviewController.includes("'e2e-disposable'"),
  'Party/Session review controller must be E2E-only',
);

const packageJson = JSON.parse(read('package.json'));
for (const scriptName of [
  'e2e:core-v2:cloud-db',
  'e2e:conversation:cloud-db',
  'e2e:trust-return-loop:cloud-db',
  'e2e:party-session:cloud-db',
  'party-session:review:status',
  'party-session:review:enable',
  'party-session:review:disable-writes',
]) {
  requireInvariant(
    packageJson.scripts?.[scriptName]?.includes('--target e2e-disposable'),
    `${scriptName} must carry its fixed E2E target`,
  );
}
for (const scriptName of [
  'supabase:roles:check',
  'supabase:staging:runtime:check',
  'supabase:e2e:cli:check',
]) {
  requireInvariant(
    Boolean(packageJson.scripts?.[scriptName]),
    `package.json is missing ${scriptName}`,
  );
}

const wrangler = read('cloudflare/media-worker/wrangler.jsonc');
requireInvariant(
  wrangler.includes(
    `https://${STAGING_RUNTIME_PROJECT.projectRef}.supabase.co`,
  ) && !wrangler.includes(E2E_DISPOSABLE_PROJECT.projectRef),
  'staging media worker must use staging and never the E2E project',
);
const e2eRunbook = read('docs/runbooks/mobile-party-session-review.md');
requireInvariant(
  !e2eRunbook.includes(
    `EXPO_PUBLIC_SUPABASE_URL="https://${E2E_DISPOSABLE_PROJECT.projectRef}.supabase.co"`,
  ) &&
    !e2eRunbook.includes('npm run start') &&
    e2eRunbook.includes('must never use this project'),
  'disposable E2E runbook must not instruct a mobile runtime',
);
const evidenceValidator = read(
  'scripts/release/check-environment-evidence.cjs',
);
requireInvariant(
  evidenceValidator.includes('schemaVersion === 2') &&
    evidenceValidator.includes('workspaceDefaultCliProjectRef') &&
    evidenceValidator.includes('remoteOperationProjectRef') &&
    evidenceValidator.includes('E2E_DISPOSABLE_PROJECT'),
  'release evidence must model the staging-runtime/E2E-CLI split',
);

if (failures.length) {
  console.error('Backend target registry check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Backend target registry check passed: staging=${STAGING_RUNTIME_PROJECT.projectRef}, e2e=${E2E_DISPOSABLE_PROJECT.projectRef}.`,
);
