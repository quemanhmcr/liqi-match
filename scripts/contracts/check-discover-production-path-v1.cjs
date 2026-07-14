const fs = require('node:fs');

const apiRepository = fs.readFileSync(
  'src/features/discover/services/discover-api-repository.ts',
  'utf8',
);
const composition = fs.readFileSync(
  'src/app-shell/runtime/create-application-services.ts',
  'utf8',
);
const vibeScreen = fs.readFileSync(
  'src/features/discover/screens/DiscoverVibesScreen.tsx',
  'utf8',
);
const setScreen = fs.readFileSync(
  'src/features/discover/screens/DiscoverSetsScreen.tsx',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

const productionDiscover = `${apiRepository}\n${composition}`;
requireInvariant(
  !/\/v1\/discover\//.test(productionDiscover),
  'Production Discover must not call nonexistent /v1/discover BFF routes',
);
requireInvariant(
  !/DiscoverApiTransport|createDiscoverHttpTransport|createRequestUrl/.test(
    productionDiscover,
  ),
  'Production Discover must not retain the removed HTTP transport seam',
);
requireInvariant(
  apiRepository.includes("this.rpc('list_discovery_candidates_v1'") &&
    composition.includes('new SupabaseMatchSetRepository()'),
  'Player and Set production paths must use their authoritative RPC repositories',
);
requireInvariant(
  apiRepository.includes('legacyCapabilityError') &&
    apiRepository.includes('Use the authoritative MatchSetRepository'),
  'Legacy generic-ID Set methods must fail closed before transport',
);
requireInvariant(
  vibeScreen.includes("EXPO_PUBLIC_APPLICATION_RUNTIME_MODE === 'api'") &&
    vibeScreen.includes('DeferredVibeDiscoveryScreen'),
  'API Vibe route must render an explicit deferred surface without a backend request',
);
requireInvariant(
  setScreen.includes("EXPO_PUBLIC_APPLICATION_RUNTIME_MODE === 'api'") &&
    setScreen.includes('MatchSetDiscoveryScreen'),
  'API Set route must use the authoritative Match Set surface',
);

if (failures.length) {
  console.error(
    `Discover production path v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log('Discover production path v1 check passed.');
