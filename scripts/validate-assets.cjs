#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readImageMetadata } = require('./lib/image-metadata.cjs');

const root = process.cwd();
const manifestPath = path.join(
  root,
  'assets/simulation/asset-manifest.v1.json',
);
const moduleRegistryPath = path.join(
  root,
  'src/entities/media-asset/data/generated-bundled-modules.ts',
);
const allowlistPath = path.join(root, 'assets/asset-duplicate-allowlist.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const moduleRegistry = fs.readFileSync(moduleRegistryPath, 'utf8');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
const errors = [];
const seenKeys = new Set();
const referencedPaths = new Set();
const allowedStates = new Set([
  'available',
  'corrupt',
  'missing',
  'unassociated',
]);
const allowedUsages = new Set(['golden-world', 'legacy-library', 'scenario']);
const extensionByFormat = {
  jpg: new Set(['.jpg', '.jpeg']),
  mp4: new Set(['.mp4']),
  png: new Set(['.png']),
  webp: new Set(['.webp']),
};
const keyPattern = /^asset:[a-z0-9][a-z0-9._:-]*$/;

if (manifest.version !== 1) {
  errors.push(`Unsupported manifest version: ${manifest.version}`);
}
let totalBundledBytes = 0;
let bundledEntryCount = 0;
for (const entry of manifest.entries ?? []) {
  validateIdentity(entry);
  validateMetadata(entry);

  if (entry.source?.type === 'placeholder') {
    if (!entry.source.variant) {
      errors.push(`Placeholder variant missing for ${entry.key}`);
    }
    continue;
  }
  if (entry.source?.type !== 'bundled') {
    errors.push(`Unsupported physical manifest source for ${entry.key}`);
    continue;
  }

  bundledEntryCount += 1;
  const relativePath = entry.source.path;
  referencedPaths.add(relativePath);
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing bundled file for ${entry.key}: ${relativePath}`);
    continue;
  }

  const bytes = fs.readFileSync(absolutePath);
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const actual = readImageMetadata(absolutePath);
  totalBundledBytes += bytes.length;
  if (actualHash !== entry.sha256)
    errors.push(`Hash mismatch for ${entry.key}`);
  if (bytes.length !== entry.byteSize) {
    errors.push(`Byte-size mismatch for ${entry.key}`);
  }
  if (actual.width !== entry.width || actual.height !== entry.height) {
    errors.push(
      `Dimension mismatch for ${entry.key}: manifest ${entry.width}x${entry.height}, file ${actual.width}x${actual.height}`,
    );
  }
  if (actual.format !== entry.format) {
    errors.push(
      `Magic-byte format mismatch for ${entry.key}: manifest ${entry.format}, file ${actual.format}`,
    );
  }
  const extension = path.extname(relativePath).toLowerCase();
  if (!extensionByFormat[entry.format]?.has(extension)) {
    errors.push(
      `Extension/format mismatch for ${entry.key}: ${extension} vs ${entry.format}`,
    );
  }
  const kindBudget = manifest.budgets?.maxBytesByKind?.[entry.kind];
  if (kindBudget === undefined) {
    errors.push(`Missing byte budget for asset kind ${entry.kind}`);
  } else if (bytes.length > kindBudget) {
    errors.push(
      `Per-asset budget exceeded for ${entry.key}: ${bytes.length} > ${kindBudget}`,
    );
  }

  const expectedModulePath = `../../../../${relativePath}`;
  if (!moduleRegistry.includes(entry.key)) {
    errors.push(`Metro registry is missing key ${entry.key}`);
  }
  if (!moduleRegistry.includes(expectedModulePath)) {
    errors.push(`Metro registry path drift for ${entry.key}: ${relativePath}`);
  }
}

const registeredModuleCount = (moduleRegistry.match(/\brequire\(/g) ?? [])
  .length;
if (registeredModuleCount !== bundledEntryCount) {
  errors.push(
    `Metro registry count mismatch: ${registeredModuleCount} modules for ${bundledEntryCount} bundled entries`,
  );
}
if (totalBundledBytes > manifest.budgets.maxTotalBundledBytes) {
  errors.push(
    `Total bundle budget exceeded: ${totalBundledBytes} > ${manifest.budgets.maxTotalBundledBytes}`,
  );
}

const goldenRoot = path.join(root, 'assets/simulation/golden-world');
for (const file of walkImages(goldenRoot)) {
  const relative = slash(path.relative(root, file));
  if (!referencedPaths.has(relative)) {
    errors.push(`Orphan golden-world asset: ${relative}`);
  }
}
for (const file of walkImages(path.join(root, 'assets/features'))) {
  errors.push(
    `Feature-owned physical asset is forbidden; move it into the canonical manifest: ${slash(
      path.relative(root, file),
    )}`,
  );
}
for (const file of walkSourceFiles(path.join(root, 'src/features'))) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('assets/simulation/')) {
    errors.push(
      `Feature imports managed simulation assets directly instead of using AssetKey: ${slash(
        path.relative(root, file),
      )}`,
    );
  }
}

const allowedDuplicateGroups = new Set(
  (allowlist.groups ?? []).map((group) => [...group.paths].sort().join('\n')),
);
const filesByHash = new Map();
for (const file of walkImages(path.join(root, 'assets'))) {
  const bytes = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const relative = slash(path.relative(root, file));
  const group = filesByHash.get(hash) ?? [];
  group.push(relative);
  filesByHash.set(hash, group);
}
for (const paths of filesByHash.values()) {
  if (paths.length < 2) continue;
  const key = [...paths].sort().join('\n');
  if (!allowedDuplicateGroups.has(key)) {
    errors.push(
      `Duplicate asset bytes are not allowlisted:\n  ${paths.join('\n  ')}`,
    );
  }
}

const mib = (totalBundledBytes / 1024 / 1024).toFixed(2);
if (errors.length) {
  process.stderr.write(
    `Asset validation failed (${errors.length}):\n${errors.map((item) => `- ${item}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Asset validation passed: ${manifest.entries.length} entries, ${mib} MiB bundled, 0 orphan, 0 unapproved duplicate.\n`,
);

function validateIdentity(entry) {
  if (!keyPattern.test(entry.key))
    errors.push(`Invalid AssetKey: ${entry.key}`);
  if (seenKeys.has(entry.key)) errors.push(`Duplicate AssetKey: ${entry.key}`);
  seenKeys.add(entry.key);
  if (!allowedStates.has(entry.simulationState)) {
    errors.push(`Invalid simulation state for ${entry.key}`);
  }
  if (!allowedUsages.has(entry.usage)) {
    errors.push(`Invalid usage declaration for ${entry.key}`);
  }

  const ownerMatch = entry.key.match(/^asset:(profile|set):([^:]+):/);
  if (ownerMatch) {
    const expectedOwner = `${ownerMatch[1]}:${ownerMatch[2]}`;
    if (entry.ownerId !== expectedOwner) {
      errors.push(
        `Owner mismatch for ${entry.key}: expected ${expectedOwner}, got ${entry.ownerId ?? 'none'}`,
      );
    }
  }
  if (entry.ownerKind === 'profile' && !entry.ownerId?.startsWith('profile:')) {
    errors.push(`Profile ownerId is invalid for ${entry.key}`);
  }
  if (entry.ownerKind === 'set' && !entry.ownerId?.startsWith('set:')) {
    errors.push(`Set ownerId is invalid for ${entry.key}`);
  }
  if (entry.ownerKind === 'message' && !entry.ownerId?.startsWith('message:')) {
    errors.push(`Message ownerId is invalid for ${entry.key}`);
  }
}

function validateMetadata(entry) {
  if (
    !Number.isInteger(entry.width) ||
    entry.width <= 0 ||
    !Number.isInteger(entry.height) ||
    entry.height <= 0
  ) {
    errors.push(`Invalid dimensions for ${entry.key}`);
  }
  const maxDimension = manifest.budgets?.maxDimension;
  if (
    !Number.isInteger(maxDimension) ||
    maxDimension <= 0 ||
    entry.width > maxDimension ||
    entry.height > maxDimension
  ) {
    errors.push(
      `Dimension budget exceeded for ${entry.key}: ${entry.width}x${entry.height} (max ${maxDimension ?? 'missing'})`,
    );
  }
  if (!extensionByFormat[entry.format]) {
    errors.push(`Unsupported format for ${entry.key}: ${entry.format}`);
  }
}

function walkImages(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkImages(target);
    return /\.(png|jpe?g|webp)$/i.test(entry.name) ? [target] : [];
  });
}

function walkSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(target);
    return /\.[tj]sx?$/.test(entry.name) ? [target] : [];
  });
}

function slash(value) {
  return value.split(path.sep).join('/');
}
