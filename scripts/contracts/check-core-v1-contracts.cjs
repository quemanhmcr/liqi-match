const fs = require('node:fs');
const path = require('node:path');

const root = path.join(process.cwd(), 'contracts', 'core-v1');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'compatibility-manifest.json'), 'utf8'),
);
const failures = [];

for (const directory of [
  'identity',
  'lifecycle',
  'profile',
  'discovery',
  'match',
  'conversation',
  'events',
  'errors',
]) {
  if (!fs.existsSync(path.join(root, directory)))
    failures.push(`missing ${directory}/`);
}

for (const [group, names] of [
  ['provider', manifest.providerFixtures],
  ['consumer', manifest.consumerFixtures],
]) {
  for (const name of names) {
    const file = path.join(root, 'fixtures', group, name);
    if (!fs.existsSync(file)) failures.push(`missing fixture ${group}/${name}`);
    else JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}

if (manifest.version !== 1 || manifest.status !== 'additive') {
  failures.push('compatibility manifest must describe additive core-v1');
}

if (failures.length) {
  console.error(
    `Core v1 contract check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Core v1 contract check passed (${manifest.providerFixtures.length} provider fixtures, ${manifest.consumerFixtures.length} consumer fixtures).`,
);
