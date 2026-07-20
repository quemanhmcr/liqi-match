#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const {
  CANONICAL_COMPONENT_IMPORT,
  CANONICAL_SCREEN_IMPORT,
  CANONICAL_THEME_IMPORT,
  CANONICAL_UI_IMPORT,
  LEGACY_BASELINE_PATH,
  gitVisibleFiles,
  hasOwnedRecipeImport,
  inspectRepositoryUi,
  isDesignRecipeFile,
  isSharedUiImplementation,
  repoPath,
} = require('./design/design-governance.cjs');
const { readImageMetadata } = require('./lib/image-metadata.cjs');

const root = path.resolve(__dirname, '..');
const failures = [];
const files = gitVisibleFiles(root);

function readJson(relative) {
  const absolute = repoPath(root, relative);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relative}: required design-governance file is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    failures.push(`${relative}: invalid JSON (${error.message})`);
    return null;
  }
}

function sameArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sortedUnique(values) {
  return (
    Array.isArray(values) &&
    values.every((value, index) => index === 0 || values[index - 1] < value)
  );
}

const deprecatedLeafImport =
  /@\/shared\/theme\/(?:colors|spacing|radius|typography)(?:['"]|\/)/;
const forbiddenLegacyDesignApi =
  /@\/shared\/components\/liquid|@\/shared\/layouts\/LiquidScreen|liquid-glass|liquid-glow|Liquid(?:Glass|EdgeGlow|Blur|Reduced)|\b(?:blurIntensity|glassIntensity|glowPreset|reducedGlass)\b/;
const forbiddenDeepDesignImport =
  /@\/shared\/components\/liqi\/|@\/shared\/layouts\/LiqiScreen\/|@\/shared\/ui\//;

for (const file of files) {
  if (!file.startsWith('src/') || !/\.(?:ts|tsx)$/.test(file)) continue;
  const source = fs.readFileSync(repoPath(root, file), 'utf8');
  if (
    !file.startsWith('src/shared/theme/') &&
    deprecatedLeafImport.test(source)
  ) {
    failures.push(
      `${file}: import from ${CANONICAL_THEME_IMPORT} instead of a deprecated leaf token module`,
    );
  }
  if (forbiddenLegacyDesignApi.test(source)) {
    failures.push(
      `${file}: previous liquid/glass/blur API is forbidden; use LiqiSurface semantic props`,
    );
  }
  if (forbiddenDeepDesignImport.test(source)) {
    failures.push(
      `${file}: import design primitives from the public package root, not an implementation file`,
    );
  }
}

const forbiddenPaths = [
  'docs/liquid-glass-design-system.md',
  'src/shared/components/liquid',
  'src/shared/components/liquid-edge-glow.tsx',
  'src/shared/theme/liquid-glass.tokens.ts',
  'src/shared/theme/liquid-glow.presets.ts',
];
for (const file of forbiddenPaths) {
  if (fs.existsSync(repoPath(root, file))) {
    failures.push(
      `${file}: obsolete design-system artifact must remain deleted`,
    );
  }
}

const governedSurfaces = [
  'src/shared/ui/AppBackground.tsx',
  'src/shared/ui/AppSurface.tsx',
  'src/shared/ui/AppButton.tsx',
  'src/shared/ui/AppCard.tsx',
  'src/shared/ui/AppChip.tsx',
  'src/shared/ui/AppIconButton.tsx',
  'src/shared/ui/AppSectionHeader.tsx',
  'src/shared/ui/AppIdentityHeader.tsx',
  'src/shared/ui/AppScreen.tsx',
  'src/shared/ui/AppText.tsx',
  'src/app-shell/access/RouteAccessGate.tsx',
  'src/app-shell/access/route-access-gate-ui.ts',
  'src/app-shell/navigation/MainTabBar.tsx',
  'src/app-shell/navigation/ResetRouteScreen.tsx',
  'src/app-shell/navigation/main-tab-bar-ui.ts',
  'src/features/home/components/HomeRecentActivityCard.tsx',
  'src/features/home/components/HomeTrustActivitySection.tsx',
  'src/features/home/screens/HomeDashboardScreen.tsx',
  'src/features/home/screens/home-dashboard-reference-sections.tsx',
  'src/features/home/screens/home-dashboard.styles.ts',
  'src/features/home/ui/home-ui.ts',
  'src/features/messages/components/ChatComposerDock.tsx',
  'src/features/messages/components/ChatMessageReportModal.tsx',
  'src/features/messages/components/ConversationCard.tsx',
  'src/features/messages/components/ConversationOptionsModal.tsx',
  'src/features/messages/components/MessageAvatarStack.tsx',
  'src/features/messages/screens/ChatConversationScreen.tsx',
  'src/features/messages/screens/MessagesScreen.tsx',
  'src/features/messages/screens/chat-conversation-composer.tsx',
  'src/features/messages/screens/chat-conversation-timeline.tsx',
  'src/features/messages/screens/chat-conversation.styles.ts',
  'src/features/messages/ui/messages-ui.ts',
];
const colorLiteralPattern = /#[0-9a-f]{3,8}\b|rgba?\s*\(/i;
for (const file of governedSurfaces) {
  const absolute = repoPath(root, file);
  if (!fs.existsSync(absolute)) {
    failures.push(`${file}: governed design surface is missing`);
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  if (
    !isSharedUiImplementation(file) &&
    !isDesignRecipeFile(file) &&
    !source.includes(CANONICAL_UI_IMPORT) &&
    !hasOwnedRecipeImport(source)
  ) {
    failures.push(
      `${file}: governed surface must consume ${CANONICAL_UI_IMPORT}`,
    );
  }
  if (colorLiteralPattern.test(source) && !isDesignRecipeFile(file)) {
    failures.push(`${file}: governed surface contains a raw color literal`);
  }
}

const legacyLock = readJson('config/design-system-legacy-paths.lock.json');
const legacyBaseline = readJson(LEGACY_BASELINE_PATH);
if (!legacyBaseline) {
  failures.push(
    `${LEGACY_BASELINE_PATH}: required legacy checksum baseline is missing`,
  );
}

if (legacyLock) {
  if (legacyLock.schemaVersion !== 1) {
    failures.push(
      'config/design-system-legacy-paths.lock.json: schemaVersion must be 1',
    );
  }
  if (legacyLock.originCommit !== '92f45f74f2ec904832ec7d44789d0d73dea43c8a') {
    failures.push(
      'config/design-system-legacy-paths.lock.json: originCommit is immutable and must remain the governance introduction baseline',
    );
  }
  if (!sortedUnique(legacyLock.paths)) {
    failures.push(
      'config/design-system-legacy-paths.lock.json: paths must be sorted and unique',
    );
  }
}

if (legacyBaseline) {
  if (legacyBaseline.schemaVersion !== 1) {
    failures.push(`${LEGACY_BASELINE_PATH}: schemaVersion must be 1`);
  }
  if (legacyBaseline.baselineCommit !== legacyLock?.originCommit) {
    failures.push(
      `${LEGACY_BASELINE_PATH}: baselineCommit must match the immutable legacy path lock`,
    );
  }
  const baselinePaths =
    legacyBaseline.entries?.map((entry) => entry.path) ?? [];
  if (!sortedUnique(baselinePaths)) {
    failures.push(
      `${LEGACY_BASELINE_PATH}: entries must be path-sorted and unique`,
    );
  }
  const lockedPaths = new Set(legacyLock?.paths ?? []);
  for (const entry of legacyBaseline.entries ?? []) {
    if (!lockedPaths.has(entry.path)) {
      failures.push(
        `${LEGACY_BASELINE_PATH}: ${entry.path} is not an original legacy path; the exception set cannot grow`,
      );
    }
  }
}

const baselineByPath = new Map(
  (legacyBaseline?.entries ?? []).map((entry) => [entry.path, entry]),
);
const uiResults = inspectRepositoryUi(root, files);
const uiByPath = new Map(uiResults.map((result) => [result.file, result]));

for (const result of uiResults) {
  const entry = baselineByPath.get(result.file);
  if (result.violations.length === 0) {
    if (entry) {
      failures.push(
        `${LEGACY_BASELINE_PATH}: remove stale entry for migrated UI ${result.file}`,
      );
    }
    continue;
  }

  if (!entry) {
    failures.push(
      `${result.file}: new design debt is forbidden (${result.violations.join(', ')}). Start from npm run design:new-screen or migrate this file to the public shared UI APIs.`,
    );
    continue;
  }

  if (entry.owner !== result.owner) {
    failures.push(
      `${LEGACY_BASELINE_PATH}: ${result.file} owner must remain ${result.owner}`,
    );
  }
  if (!sameArray(entry.violations, result.violations)) {
    failures.push(
      `${result.file}: legacy violation shape changed. Complete the migration and remove its baseline entry instead of evolving the old design (${result.violations.join(', ')}).`,
    );
  }
  if (entry.sha256 !== result.sha256) {
    failures.push(
      `${result.file}: checksum differs from the frozen legacy baseline. Materially edited legacy UI must migrate to the Home-derived design language; do not refresh the checksum in ordinary feature work.`,
    );
  }
}

for (const entry of legacyBaseline?.entries ?? []) {
  if (!uiByPath.has(entry.path)) {
    failures.push(
      `${LEGACY_BASELINE_PATH}: remove stale entry for missing or non-visual file ${entry.path}`,
    );
  }
}

const messagesCompositionContracts = [
  {
    file: 'src/features/messages/screens/MessagesScreen.tsx',
    required: [
      'AppIdentityHeader',
      'messagesUi.gradients.filterSelected',
      '<ConversationCard',
    ],
  },
  {
    file: 'src/features/messages/components/ConversationCard.tsx',
    required: [
      'AppCard',
      'messagesChatAssets',
      'messagesUi.gradients.cardScrim',
    ],
  },
  {
    file: 'src/features/messages/screens/ChatConversationScreen.tsx',
    required: ['messagesChatAssets.chatWallpaper', 'wallpaperScrim'],
  },
  {
    file: 'src/features/messages/screens/chat-conversation-timeline.tsx',
    required: [
      'AppIdentityHeader',
      "source?.type !== 'play_session'",
      'messagesChatAssets.chatEventBanner',
    ],
  },
  {
    file: 'src/features/messages/screens/messages-redesign-assets.ts',
    required: [
      'chat_event_banner_bg.png',
      'chat_wallpaper_bg.png',
      'messages_love_room_bg.png',
      'messages_pair_room_bg.png',
      'messages_party_room_bg.png',
      'messages_rank_team_bg.png',
    ],
  },
];
for (const contract of messagesCompositionContracts) {
  const absolute = repoPath(root, contract.file);
  if (!fs.existsSync(absolute)) {
    failures.push(
      `${contract.file}: Messages design contract surface is missing`,
    );
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const required of contract.required) {
    if (!source.includes(required)) {
      failures.push(
        `${contract.file}: missing Messages design contract ${required}`,
      );
    }
  }
}

const messagesAssetContracts = {
  'chat_event_banner_bg.png': { height: 512, width: 2048 },
  'chat_wallpaper_bg.png': { height: 2560, width: 1440 },
  'messages_love_room_bg.png': { height: 640, width: 2048 },
  'messages_pair_room_bg.png': { height: 640, width: 2048 },
  'messages_party_room_bg.png': { height: 640, width: 2048 },
  'messages_rank_team_bg.png': { height: 640, width: 2048 },
};
const messagesAssetRoot = repoPath(
  root,
  'assets/new_ui/liqi_messages_backgrounds',
);
let messagesAssetBytes = 0;
for (const [file, expected] of Object.entries(messagesAssetContracts)) {
  const absolute = path.join(messagesAssetRoot, file);
  if (!fs.existsSync(absolute)) {
    failures.push(`${file}: required Messages background is missing`);
    continue;
  }
  const actual = readImageMetadata(absolute);
  if (
    actual.format !== 'png' ||
    actual.width !== expected.width ||
    actual.height !== expected.height
  ) {
    failures.push(
      `${file}: expected PNG ${expected.width}x${expected.height}, received ${actual.format} ${actual.width}x${actual.height}`,
    );
  }
  messagesAssetBytes += fs.statSync(absolute).size;
}
const messagesAssetBudgetBytes = 5 * 1024 * 1024;
if (messagesAssetBytes > messagesAssetBudgetBytes) {
  failures.push(
    `Messages backgrounds exceed the 5 MiB bundle budget: ${messagesAssetBytes} bytes`,
  );
}

const foundation = fs.readFileSync(
  repoPath(root, 'src/shared/theme/liqi-foundation.tokens.ts'),
  'utf8',
);
if (!foundation.includes("liqiDesignVersion = '1.0.0'")) {
  failures.push(
    'liqi-foundation.tokens.ts: missing approved design version 1.0.0',
  );
}
if (!foundation.includes('minimum: 44')) {
  failures.push(
    'liqi-foundation.tokens.ts: minimum touch target must remain 44 dp',
  );
}

for (const documentation of [
  'DESIGN.md',
  'docs/design/LIQI_DESIGN_SYSTEM.md',
  'docs/adr/0009-home-derived-design-language-governance.md',
]) {
  if (!fs.existsSync(repoPath(root, documentation))) {
    failures.push(`${documentation}: design usage contract is missing`);
  }
}

const packageJson = JSON.parse(
  fs.readFileSync(repoPath(root, 'package.json'), 'utf8'),
);
for (const dependency of ['expo-blur', '@shopify/react-native-skia']) {
  if (
    packageJson.dependencies?.[dependency] ||
    packageJson.devDependencies?.[dependency]
  ) {
    failures.push(
      `package.json: ${dependency} belongs to the removed effect system`,
    );
  }
}
if (
  packageJson.scripts?.['design-system:check'] !==
  'node scripts/check-design-system.cjs'
) {
  failures.push(
    'package.json: design-system:check script is missing or changed',
  );
}
if (
  packageJson.scripts?.['design:new-screen'] !==
  'node scripts/design/create-liqi-screen.cjs'
) {
  failures.push(
    'package.json: design:new-screen must expose the canonical screen scaffold',
  );
}
if (
  !(packageJson.scripts?.['architecture:check'] ?? '').includes(
    'design-system:check',
  )
) {
  failures.push(
    'package.json: architecture:check must include design-system:check',
  );
}

for (const api of [
  ['src/shared/ui/theme/app-theme.ts', "appUiVersion = '1.0.0'"],
  ['src/shared/ui/index.ts', 'AppSurface'],
  ['src/shared/ui/AppScreen.tsx', 'export function AppScreen'],
  ['src/shared/components/liqi/index.ts', 'LiqiSurface'],
  ['src/shared/layouts/LiqiScreen.tsx', 'AppScreen as LiqiScreen'],
]) {
  const source = fs.readFileSync(repoPath(root, api[0]), 'utf8');
  if (!source.includes(api[1])) {
    failures.push(
      `${api[0]}: canonical public API marker ${api[1]} is missing`,
    );
  }
}

if (failures.length) {
  console.error('Design system check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Design system check passed (${governedSurfaces.length} strict surfaces, ${uiResults.length} visual files, ${baselineByPath.size} frozen legacy files, canonical version 1.0.0).`,
);
