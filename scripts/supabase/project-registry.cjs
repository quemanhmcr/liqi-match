#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const TARGETS = ['staging-runtime', 'e2e-disposable'];
const registryPath = path.resolve(
  __dirname,
  '..',
  '..',
  'config',
  'supabase-projects.json',
);

function loadRegistry() {
  const value = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (value?.schemaVersion !== 1 || !value?.projects) {
    throw new Error('Supabase project registry schema is invalid.');
  }
  for (const target of TARGETS) {
    const project = value.projects[target];
    if (!project || project.target !== target) {
      throw new Error(`Supabase project registry is missing ${target}.`);
    }
    if (!PROJECT_REF_PATTERN.test(project.projectRef ?? '')) {
      throw new Error(`${target} has an invalid project ref.`);
    }
    if (!project.projectName?.trim()) {
      throw new Error(`${target} has no project name.`);
    }
  }
  const refs = TARGETS.map((target) => value.projects[target].projectRef);
  if (new Set(refs).size !== refs.length) {
    throw new Error('Supabase project roles must use distinct project refs.');
  }
  return Object.freeze(value);
}

const registry = loadRegistry();
const STAGING_RUNTIME_PROJECT = Object.freeze(
  registry.projects['staging-runtime'],
);
const E2E_DISPOSABLE_PROJECT = Object.freeze(
  registry.projects['e2e-disposable'],
);

function optionValue(argv, name) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function projectForTarget(target) {
  const project = registry.projects[target];
  if (!project) {
    throw new Error(
      `Unknown Supabase target ${target ?? '<missing>'}. Expected ${TARGETS.join(' or ')}.`,
    );
  }
  return project;
}

function projectForRef(projectRef) {
  return TARGETS.map((target) => registry.projects[target]).find(
    (project) => project.projectRef === projectRef,
  );
}

function projectRefFromUrl(rawUrl, label = 'Supabase URL') {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return 'local';
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (!match) {
    throw new Error(`${label} does not contain a canonical project ref.`);
  }
  return match[1];
}

function assertProjectTarget(projectRef, target, label = 'Supabase project') {
  const project = projectForTarget(target);
  if (projectRef !== project.projectRef) {
    const observed = projectForRef(projectRef);
    throw new Error(
      `${label} ${projectRef ?? '<missing>'} is ${observed?.target ?? 'unregistered'}, not ${target} (${project.projectRef}).`,
    );
  }
  return project;
}

function assertUrlProjectTarget(rawUrl, target, label = 'Supabase URL') {
  return assertProjectTarget(projectRefFromUrl(rawUrl, label), target, label);
}

function requireExplicitProjectTarget(argv, expectedTarget) {
  const project = projectForTarget(expectedTarget);
  const target = optionValue(argv, '--target');
  const projectRef = optionValue(argv, '--project-ref');
  if (!target && !projectRef) {
    throw new Error(
      `Refusing remote operation without --target ${expectedTarget} (or the exact --project-ref ${project.projectRef}).`,
    );
  }
  if (target && target !== expectedTarget) {
    throw new Error(
      `Refusing target ${target}; this command is restricted to ${expectedTarget}.`,
    );
  }
  if (projectRef && projectRef !== project.projectRef) {
    throw new Error(
      `Refusing project ${projectRef}; ${expectedTarget} is ${project.projectRef}.`,
    );
  }
  return project;
}

function readLinkedProject(repoRoot, linkedRefFile) {
  const refCandidates = linkedRefFile
    ? [path.resolve(repoRoot, linkedRefFile)]
    : [
        path.join(repoRoot, 'supabase', '.temp', 'project-ref'),
        path.join(repoRoot, '.supabase', 'project-ref'),
      ];
  const refFile = refCandidates.find((candidate) => fs.existsSync(candidate));
  if (!refFile) {
    throw new Error(
      'No linked Supabase project found. Run `supabase link` first.',
    );
  }
  const projectRef = fs.readFileSync(refFile, 'utf8').trim();
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error('Linked Supabase project ref is invalid.');
  }
  const metadataFile = path.join(path.dirname(refFile), 'linked-project.json');
  let linkedProjectName = null;
  if (fs.existsSync(metadataFile)) {
    try {
      linkedProjectName =
        JSON.parse(fs.readFileSync(metadataFile, 'utf8')).name ?? null;
    } catch {
      throw new Error('Linked Supabase project metadata is invalid JSON.');
    }
  }
  return {
    linkedProjectName,
    projectRef,
    refFile,
    registeredProject: projectForRef(projectRef) ?? null,
  };
}

function assertLinkedProjectTarget(repoRoot, target, linkedRefFile) {
  const linked = readLinkedProject(repoRoot, linkedRefFile);
  const project = assertProjectTarget(
    linked.projectRef,
    target,
    'Linked Supabase CLI project',
  );
  return { ...linked, project };
}

function runSelfTest() {
  if (!STAGING_RUNTIME_PROJECT.allowMobileRuntime) {
    throw new Error('Staging must allow mobile runtime.');
  }
  if (STAGING_RUNTIME_PROJECT.allowCloudDatabaseE2e) {
    throw new Error('Staging must reject cloud database E2E.');
  }
  if (!E2E_DISPOSABLE_PROJECT.allowCloudDatabaseE2e) {
    throw new Error('E2E project must allow cloud database E2E.');
  }
  if (E2E_DISPOSABLE_PROJECT.allowMobileRuntime) {
    throw new Error('E2E project must reject mobile runtime.');
  }
  assertUrlProjectTarget(
    `https://${STAGING_RUNTIME_PROJECT.projectRef}.supabase.co`,
    'staging-runtime',
  );
  let rejected = false;
  try {
    assertUrlProjectTarget(
      `https://${E2E_DISPOSABLE_PROJECT.projectRef}.supabase.co`,
      'staging-runtime',
    );
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Cross-role project use was not rejected.');
  console.log(
    `Supabase project registry self-test passed: runtime=${STAGING_RUNTIME_PROJECT.projectRef}, e2e=${E2E_DISPOSABLE_PROJECT.projectRef}.`,
  );
}

if (require.main === module) {
  try {
    runSelfTest();
  } catch (error) {
    console.error(`Supabase project registry failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  E2E_DISPOSABLE_PROJECT,
  PROJECT_REF_PATTERN,
  STAGING_RUNTIME_PROJECT,
  TARGETS,
  assertLinkedProjectTarget,
  assertProjectTarget,
  assertUrlProjectTarget,
  optionValue,
  projectForRef,
  projectForTarget,
  projectRefFromUrl,
  readLinkedProject,
  registry,
  requireExplicitProjectTarget,
};
