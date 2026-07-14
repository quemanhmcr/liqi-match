const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/202607141440_profile_trusted_stats_cutover_v2.sql',
);
const testPath = path.join(
  root,
  'supabase/tests/database/core_v2_profile_trusted_stats_cutover.test.sql',
);
const identityPath = path.join(
  root,
  'src/features/profile/edit/components/IdentitySection.tsx',
);
const commandPath = path.join(
  root,
  'src/features/profile/edit/services/commands/save-profile-identity.ts',
);
const legacySavePath = path.join(
  root,
  'src/features/profile/services/profile-service.ts',
);
const statsBarPath = path.join(
  root,
  'src/features/profile/components/ProfileStatsBar.tsx',
);
const profileScreenPath = path.join(
  root,
  'src/features/profile/screens/ProfileScreen.tsx',
);
const profileShareScreenPath = path.join(
  root,
  'src/features/profile/screens/ProfileShareScreen.tsx',
);

for (const file of [
  migrationPath,
  testPath,
  identityPath,
  commandPath,
  legacySavePath,
  statsBarPath,
  profileScreenPath,
  profileShareScreenPath,
]) {
  if (!fs.existsSync(file))
    throw new Error(`Missing trusted-stat file: ${file}`);
}

const migration = fs.readFileSync(migrationPath, 'utf8');
const test = fs.readFileSync(testPath, 'utf8');
const identity = fs.readFileSync(identityPath, 'utf8');
const command = fs.readFileSync(commandPath, 'utf8');
const legacySave = fs.readFileSync(legacySavePath, 'utf8');
const statsBar = fs.readFileSync(statsBarPath, 'utf8');
const profileScreen = fs.readFileSync(profileScreenPath, 'utf8');
const profileShareScreen = fs.readFileSync(profileShareScreenPath, 'utf8');

function requireInvariant(condition, message) {
  if (!condition) throw new Error(message);
}

requireInvariant(
  migration.includes("'{unverified_legacy,profile_stats}'") &&
    migration.includes("media_summary -> 'profile_stats'"),
  'Legacy editable stats must be preserved only under unverified_legacy',
);
requireInvariant(
  migration.includes('reject_authenticated_trusted_stats_mutation_v2') &&
    migration.includes('auth.uid() is not null') &&
    migration.includes("'trusted_stats_read_only'"),
  'Authenticated trusted-looking stat mutations must fail closed with a stable code',
);
requireInvariant(
  migration.includes(
    'before update of media_summary on public.profile_habits',
  ) && migration.includes('from public, anon, authenticated'),
  'The cutover guard must be an automatic least-privilege trigger',
);
requireInvariant(
  !identity.includes('function StatInput') &&
    !identity.includes('label="Số trận"') &&
    !identity.includes('label="Tỷ lệ thắng"') &&
    !identity.includes('label="Đánh giá"') &&
    !identity.includes('label="Uy tín"') &&
    identity.includes('Thành tích đã được xác minh tự động'),
  'Profile Edit must not expose client-editable authoritative statistics',
);
requireInvariant(
  command.includes('normalizeIdentityStats(input.baseline)') &&
    !command.includes('...current.stats'),
  'Identity save must preserve the immutable baseline legacy payload',
);
requireInvariant(
  legacySave.includes('existingMediaSummary.profile_stats') &&
    legacySave.includes('unverified_legacy') &&
    !legacySave.includes('profile_stats: normalizeProfileStats(input.stats)'),
  'Legacy save path must preserve and relabel old stats instead of accepting client values',
);
requireInvariant(
  statsBar.includes('PlayerTrustProjectionV2') &&
    statsBar.includes('completedSessions') &&
    statsBar.includes('completionReliabilityBps') &&
    statsBar.includes('positiveEndorsements') &&
    statsBar.includes('repeatTeammateCount') &&
    !statsBar.includes('type ProfileStats') &&
    !statsBar.includes("from '../services/profile-service'") &&
    !statsBar.includes("label: 'Đánh giá'") &&
    !statsBar.includes("label: 'Uy tín'"),
  'Profile statistics must render explainable platform-derived trust dimensions only',
);
requireInvariant(
  profileScreen.includes('usePlayerTrustProjection') &&
    profileScreen.includes('trustProjection={trustProjectionQuery.data}') &&
    !profileScreen.includes('profile.stats.reputation') &&
    !profileScreen.includes('Hợp vibe'),
  'Profile must consume the trust projection provider and never derive a score from legacy stats',
);
requireInvariant(
  profileShareScreen.includes('usePlayerTrustProjection') &&
    profileShareScreen.includes(
      'trustProjection={trustProjectionQuery.data}',
    ) &&
    profileShareScreen.includes('label="Buổi chơi"') &&
    profileShareScreen.includes('completionReliabilityBps') &&
    profileShareScreen.includes('positiveEndorsements') &&
    !profileShareScreen.includes('profile.stats.matches') &&
    !profileShareScreen.includes('profile.stats.winRate') &&
    !profileShareScreen.includes('profile.stats.rating') &&
    profileShareScreen.includes('Chưa tải được số liệu xác minh'),
  'Profile share poster must use authoritative trust projection data and fail closed without legacy fallbacks',
);

const plan = Number(test.match(/select plan\((\d+)\)/i)?.[1] ?? 0);
const assertionPatterns = [
  /select has_function\(/gi,
  /select has_trigger\(/gi,
  /select throws_like\(/gi,
  /select lives_ok\(/gi,
  /select is\(/gi,
  /select ok\(/gi,
];
const assertionCount = assertionPatterns.reduce(
  (total, pattern) => total + [...test.matchAll(pattern)].length,
  0,
);
requireInvariant(
  plan === assertionCount && assertionCount >= 8,
  `Trusted-stat pgTAP plan mismatch: plan=${plan}, assertions=${assertionCount}`,
);
requireInvariant(
  test.includes('trusted_stats_read_only') &&
    test.includes('unverified_legacy') &&
    test.includes('unrelated profile metadata remains editable'),
  'pgTAP must prove mutation denial, migration preservation and unrelated edit compatibility',
);

console.log(
  `Core V2 profile trust surface check passed (${assertionCount} pgTAP assertions).`,
);
