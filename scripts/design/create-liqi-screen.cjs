#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const dryRunIndex = args.indexOf('--dry-run');
const dryRun = dryRunIndex >= 0;
if (dryRun) args.splice(dryRunIndex, 1);

function usage(message) {
  if (message) console.error(message);
  console.error(
    'Usage: npm run design:new-screen -- <feature> <PascalCaseName> [--dry-run]',
  );
  process.exit(1);
}

const [feature, requestedName] = args;
if (!feature || !requestedName || args.length !== 2) usage();
if (!/^[a-z][a-z0-9-]*$/.test(feature)) {
  usage(
    'Feature must be kebab-case, for example notifications or play-session.',
  );
}
if (!/^[A-Z][A-Za-z0-9]*$/.test(requestedName)) {
  usage('Screen name must be PascalCase, for example NotificationSettings.');
}

const featureRoot = path.join(root, 'src', 'features', feature);
if (!fs.existsSync(featureRoot)) {
  usage(`Unknown feature: src/features/${feature} does not exist.`);
}

const baseName = requestedName.endsWith('Screen')
  ? requestedName.slice(0, -'Screen'.length)
  : requestedName;
const componentName = `${baseName}Screen`;
const words = baseName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const kebab = baseName
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
  .toLowerCase();

const screenRelative = `src/features/${feature}/screens/${componentName}.tsx`;
const testRelative = `src/features/${feature}/__tests__/${kebab}-screen.test.tsx`;

const screen = `import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  AppCard,
  AppScreen,
  AppSectionHeader,
  appColors,
  appSpacing,
  appTypography,
  isCompactViewport,
} from '@/shared/ui';

// TODO(design-scaffold): Replace placeholder copy and composition with authoritative feature state.
export function ${componentName}() {
  const { width } = useWindowDimensions();
  const compact = isCompactViewport(width);

  return (
    <AppScreen
      contentContainerStyle={[styles.content, compact && styles.contentCompact]}
      subtitle="Replace this copy with authoritative product state."
      title="${words}"
    >
      <AppSectionHeader label="OVERVIEW" title="First section" />
      <AppCard contentStyle={styles.cardContent}>
        <View style={styles.copy}>
          <Text style={styles.cardTitle}>Home-derived composition</Text>
          <Text style={styles.body}>
            Use semantic tokens, shared primitives and real domain data.
          </Text>
        </View>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    ...appTypography.body,
    color: appColors.text.secondary,
  },
  cardContent: {
    gap: appSpacing.xl,
  },
  cardTitle: {
    ...appTypography.cardTitle,
    color: appColors.text.primary,
  },
  content: {
    gap: appSpacing['4xl'],
  },
  contentCompact: {
    gap: appSpacing['3xl'],
  },
  copy: {
    gap: appSpacing.sm,
  },
});
`;

const test = `import { describe, expect, it } from '@jest/globals';

import { ${componentName} } from '@/features/${feature}/screens/${componentName}';
import { renderWithProviders } from '@/test/render-with-providers';

describe('${componentName}', () => {
  it('renders the canonical screen shell and first section', async () => {
    const screen = await renderWithProviders(<${componentName} />);

    expect(await screen.findByText('${words}')).toBeTruthy();
    expect(screen.getByText('First section')).toBeTruthy();
  });
});
`;

const outputs = [
  [screenRelative, screen],
  [testRelative, test],
];

for (const [relative] of outputs) {
  if (fs.existsSync(path.join(root, relative))) {
    usage(`Refusing to overwrite existing file: ${relative}`);
  }
}

if (dryRun) {
  for (const [relative, content] of outputs) {
    console.log(`===== ${relative} =====`);
    process.stdout.write(content);
  }
  process.exit(0);
}

for (const [relative, content] of outputs) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
  console.log(`Created ${relative}`);
}

console.log(
  'Next: replace placeholder copy/composition, remove TODO(design-scaffold), wire a thin route adapter, then run npm run design-system:check and related tests.',
);
