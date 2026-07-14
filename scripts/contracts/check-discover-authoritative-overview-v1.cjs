const fs = require('node:fs');

const repository = fs.readFileSync(
  'src/features/discover/services/discover-api-repository.ts',
  'utf8',
);
const templateSource = fs.readFileSync(
  'src/features/discover/services/discover-authoritative-overview.ts',
  'utf8',
);
const testSource = fs.readFileSync(
  'src/features/discover/__tests__/discover-api-repository.test.ts',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  !repository.includes('/v1/discover/overview'),
  'production adapter must not call the unavailable overview endpoint',
);
requireInvariant(
  repository.includes('const players = await this.listPlayers(context'),
  'overview must consume the authoritative player snapshot path',
);
requireInvariant(
  repository.includes('createAuthoritativePlayerOverview'),
  'overview must use the empty authoritative envelope builder',
);
requireInvariant(
  !/MockDiscoverRepository|simulation|fixture/i.test(templateSource),
  'production overview template must not import simulation or fixture content',
);
requireInvariant(
  templateSource.includes('const playerCollectionPaths =') &&
    !templateSource.includes('const playerCollectionPaths = []'),
  'overview template must identify at least one authoritative player collection',
);
requireInvariant(
  !repository.includes('DiscoverApiTransport') &&
    !repository.includes('createDiscoverHttpTransport') &&
    testSource.includes(
      'rejects legacy Set and Vibe reads before network access',
    ),
  'provider code and tests must prove the legacy BFF transport seam is removed',
);
requireInvariant(
  testSource.includes("'list_discovery_candidates_v1'"),
  'provider test must prove overview uses the candidate RPC',
);

const templateMatch = templateSource.match(
  /const emptyOverviewTemplate = ([\s\S]*?) as const;/,
);
if (!templateMatch) {
  failures.push('empty overview template JSON was not found');
} else {
  try {
    const template = Function(`"use strict"; return (${templateMatch[1]});`)();
    const nonEmptyArrays = [];
    const inspect = (value, path = '$') => {
      if (Array.isArray(value)) {
        if (value.length) nonEmptyArrays.push(path);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value)) {
        inspect(entry, `${path}.${key}`);
      }
    };
    inspect(template);
    requireInvariant(
      nonEmptyArrays.length === 0,
      `overview template contains product collection data: ${nonEmptyArrays.join(', ')}`,
    );
  } catch (error) {
    failures.push(
      `overview template object is not parseable: ${error.message}`,
    );
  }
}

if (failures.length) {
  console.error(
    `Authoritative Discover overview v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log('Authoritative Discover overview v1 check passed.');
