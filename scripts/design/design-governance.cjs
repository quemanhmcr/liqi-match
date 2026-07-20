const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CANONICAL_UI_IMPORT = '@/shared/ui';
const CANONICAL_THEME_IMPORT = CANONICAL_UI_IMPORT;
const CANONICAL_COMPONENT_IMPORT = CANONICAL_UI_IMPORT;
const CANONICAL_SCREEN_IMPORT = CANONICAL_UI_IMPORT;
const LEGACY_THEME_IMPORT = '@/shared/theme/liqi-design-system';
const LEGACY_COMPONENT_IMPORT = '@/shared/components/liqi';
const LEGACY_SCREEN_IMPORT = '@/shared/layouts/LiqiScreen';
const LEGACY_BASELINE_PATH = 'config/design-system-legacy-baseline.json';

const UI_ROOTS = [
  'src/features/',
  'src/app-shell/',
  'src/shared/components/',
  'src/shared/layouts/',
  'src/shared/ui/',
];

const RAW_COLOR_PATTERN = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i;
const SCREEN_PATH_PATTERN = /^src\/features\/[^/]+\/screens\/[^/]*Screen\.tsx$/;
const SCREEN_HOST_MARKER_PATTERN =
  /\/\/\s*liqi-screen-host:\s*(?:embedded|modal)\s+--\s+\S.{10,}/i;
const OWNED_RECIPE_PATH_PATTERN =
  /^(?:src\/features\/[^/]+\/ui\/[^/]+-ui\.ts|src\/app-shell\/[^/]+\/[^/]+-ui\.ts|src\/shared\/ui\/(?:theme|internal)\/[^/]+\.ts)$/;
const OWNED_RECIPE_IMPORT_PATTERN =
  /from\s+['"](?:\.\/(?:[^'"]*\/)?[^/'"]+-ui|(?:\.\.\/)+ui\/[^/'"]+-ui)['"]/;

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function repoPath(root, relative) {
  return path.join(root, ...relative.split('/'));
}

function gitVisibleFiles(root) {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => normalizePath(file))
    .filter((file) => fs.existsSync(repoPath(root, file)));
}

function isTestFile(file) {
  return (
    file.includes('/__tests__/') ||
    /\.(?:test|spec)\.[tj]sx?$/.test(file) ||
    file.startsWith('src/test/')
  );
}

function isUiSourceFile(file) {
  return (
    /\.[tj]sx?$/.test(file) &&
    !isTestFile(file) &&
    UI_ROOTS.some((root) => file.startsWith(root))
  );
}

function hasImport(source, moduleName) {
  return (
    source.includes(`'${moduleName}'`) || source.includes(`"${moduleName}"`)
  );
}

function hasPublicDesignImport(source) {
  return [CANONICAL_UI_IMPORT, LEGACY_THEME_IMPORT].some((moduleName) =>
    hasImport(source, moduleName),
  );
}

function usesPublicDesignSurface(source) {
  return [
    CANONICAL_UI_IMPORT,
    LEGACY_THEME_IMPORT,
    LEGACY_COMPONENT_IMPORT,
    LEGACY_SCREEN_IMPORT,
  ].some((moduleName) => hasImport(source, moduleName));
}

function isDesignRecipeFile(file) {
  return OWNED_RECIPE_PATH_PATTERN.test(file);
}

function hasOwnedRecipeImport(source) {
  return OWNED_RECIPE_IMPORT_PATTERN.test(source);
}

function isSharedUiImplementation(file) {
  return file.startsWith('src/shared/ui/');
}

function usesVisualImplementation(source) {
  return (
    /StyleSheet\.create\s*\(/.test(source) ||
    /from\s+['"]expo-linear-gradient['"]/.test(source) ||
    usesPublicDesignSurface(source) ||
    RAW_COLOR_PATTERN.test(source)
  );
}

function ownerForPath(file) {
  const feature = file.match(/^src\/features\/([^/]+)\//);
  if (feature) return `feature:${feature[1]}`;
  if (file.startsWith('src/app-shell/')) return 'platform:app-shell';
  if (file.startsWith('src/shared/')) return 'platform:shared';
  return 'platform:frontend';
}

function sha256(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function inspectUiFile(file, source) {
  const violations = [];
  const visual = usesVisualImplementation(source);

  if (!visual) {
    return {
      file,
      owner: ownerForPath(file),
      sha256: sha256(source),
      violations,
      visual,
    };
  }

  if (source.includes('TODO(design-scaffold)')) {
    violations.push('unresolved-design-scaffold');
  }

  if (
    !isSharedUiImplementation(file) &&
    !isDesignRecipeFile(file) &&
    !hasPublicDesignImport(source) &&
    !hasOwnedRecipeImport(source)
  ) {
    violations.push('missing-canonical-theme-import');
  }

  if (RAW_COLOR_PATTERN.test(source) && !isDesignRecipeFile(file)) {
    violations.push('raw-color-literal');
  }

  if (
    SCREEN_PATH_PATTERN.test(file) &&
    !source.includes('<AppScreen') &&
    !source.includes('<LiqiScreen') &&
    !SCREEN_HOST_MARKER_PATTERN.test(source)
  ) {
    violations.push('missing-liqi-screen-host');
  }

  if (
    /@\/shared\/theme\/(?:liqi-foundation\.tokens|liqi-component\.tokens|colors|spacing|radius|typography)/.test(
      source,
    )
  ) {
    violations.push('non-public-theme-import');
  }

  if (/@\/shared\/components\/liqi\//.test(source)) {
    violations.push('deep-liqi-component-import');
  }

  if (/@\/shared\/layouts\/LiqiScreen\//.test(source)) {
    violations.push('deep-liqi-screen-import');
  }

  if (/@\/shared\/ui\//.test(source)) {
    violations.push('deep-shared-ui-import');
  }

  return {
    file,
    owner: ownerForPath(file),
    sha256: sha256(source),
    violations: [...new Set(violations)].sort(),
    visual,
  };
}

function inspectRepositoryUi(root, files = gitVisibleFiles(root)) {
  return files
    .filter(isUiSourceFile)
    .map((file) => {
      const source = fs.readFileSync(repoPath(root, file), 'utf8');
      return inspectUiFile(file, source);
    })
    .filter((result) => result.visual);
}

function readLegacyBaseline(root) {
  const file = repoPath(root, LEGACY_BASELINE_PATH);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stableBaselineEntry(result) {
  return {
    owner: result.owner,
    path: result.file,
    sha256: result.sha256,
    violations: result.violations,
  };
}

module.exports = {
  CANONICAL_COMPONENT_IMPORT,
  CANONICAL_SCREEN_IMPORT,
  CANONICAL_THEME_IMPORT,
  CANONICAL_UI_IMPORT,
  LEGACY_BASELINE_PATH,
  SCREEN_HOST_MARKER_PATTERN,
  gitVisibleFiles,
  hasOwnedRecipeImport,
  hasPublicDesignImport,
  inspectRepositoryUi,
  inspectUiFile,
  isDesignRecipeFile,
  isSharedUiImplementation,
  isUiSourceFile,
  normalizePath,
  ownerForPath,
  readLegacyBaseline,
  repoPath,
  stableBaselineEntry,
};
