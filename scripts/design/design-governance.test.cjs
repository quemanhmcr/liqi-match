const assert = require('node:assert/strict');
const test = require('node:test');

const { inspectUiFile } = require('./design-governance.cjs');

const publicImports = `
import { StyleSheet, Text } from 'react-native';
import { AppCard, AppScreen, appColors, appSpacing, appTypography } from '@/shared/ui';
`;

const transitionalLegacyImports = `
import { StyleSheet, Text } from 'react-native';
import { LiqiCard } from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors } from '@/shared/theme/liqi-design-system';
`;

test('accepts a canonical full-screen surface', () => {
  const result = inspectUiFile(
    'src/features/example/screens/ExampleScreen.tsx',
    `${publicImports}
export function ExampleScreen() {
  return <AppScreen title="Example"><AppCard><Text>Ready</Text></AppCard></AppScreen>;
}
const styles = StyleSheet.create({
  text: { ...appTypography.body, color: appColors.text.primary, marginTop: appSpacing.sm },
});
`,
  );

  assert.deepEqual(result.violations, []);
});

test('temporarily accepts the public legacy adapters during route migration', () => {
  const result = inspectUiFile(
    'src/features/example/screens/LegacyScreen.tsx',
    `${transitionalLegacyImports}
export function LegacyScreen() {
  return <LiqiScreen title="Legacy"><LiqiCard><Text>Ready</Text></LiqiCard></LiqiScreen>;
}
const styles = StyleSheet.create({ text: { color: liqiColors.text.primary } });
`,
  );

  assert.deepEqual(result.violations, []);
});

test('rejects raw color literals even when canonical tokens are imported', () => {
  const result = inspectUiFile(
    'src/features/example/components/ExampleCard.tsx',
    `${publicImports}
export function ExampleCard() { return <Text style={styles.text}>Card</Text>; }
const styles = StyleSheet.create({ text: { color: '#FFFFFF' } });
`,
  );

  assert.deepEqual(result.violations, ['raw-color-literal']);
});

test('allows raw values only inside an owned feature recipe', () => {
  const result = inspectUiFile(
    'src/features/example/ui/example-ui.ts',
    `export const exampleUi = { colors: { card: '#FFFFFF' } } as const;`,
  );

  assert.deepEqual(result.violations, []);
});

test('accepts a component that consumes its feature-owned recipe', () => {
  const result = inspectUiFile(
    'src/features/example/components/ExampleCard.tsx',
    `import { StyleSheet, Text } from 'react-native';
import { exampleUi } from '../ui/example-ui';
export function ExampleCard() { return <Text style={styles.text}>Card</Text>; }
const styles = StyleSheet.create({ text: { color: exampleUi.colors.card } });
`,
  );

  assert.deepEqual(result.violations, []);
});

test('requires a public design API for visual implementations', () => {
  const result = inspectUiFile(
    'src/features/example/components/ExampleCard.tsx',
    `import { StyleSheet, Text } from 'react-native';
export function ExampleCard() { return <Text style={styles.text}>Card</Text>; }
const styles = StyleSheet.create({ text: { fontWeight: '700' } });
`,
  );

  assert.deepEqual(result.violations, ['missing-canonical-theme-import']);
});

test('allows an explicitly documented embedded screen host', () => {
  const result = inspectUiFile(
    'src/features/example/screens/EmbeddedScreen.tsx',
    `${publicImports}
// liqi-screen-host: embedded -- Rendered inside the parent session screen shell.
export function EmbeddedScreen() { return <Text>Embedded</Text>; }
const styles = StyleSheet.create({ text: { color: appColors.text.primary } });
`,
  );

  assert.deepEqual(result.violations, []);
});

test('rejects deep imports into the canonical shared UI package', () => {
  const result = inspectUiFile(
    'src/features/example/components/ExampleCard.tsx',
    `import { StyleSheet, Text } from 'react-native';
import { AppCard } from '@/shared/ui/AppCard';
export function ExampleCard() { return <AppCard><Text>Card</Text></AppCard>; }
const styles = StyleSheet.create({ text: { fontWeight: '700' } });
`,
  );

  assert.deepEqual(result.violations, [
    'deep-shared-ui-import',
    'missing-canonical-theme-import',
  ]);
});

test('rejects unresolved screen scaffold placeholders', () => {
  const result = inspectUiFile(
    'src/features/example/screens/ScaffoldScreen.tsx',
    `${publicImports}
// TODO(design-scaffold): Replace placeholder copy and composition with authoritative feature state.
export function ScaffoldScreen() { return <AppScreen title="Scaffold"><Text>Placeholder</Text></AppScreen>; }
const styles = StyleSheet.create({ text: { color: appColors.text.primary } });
`,
  );

  assert.deepEqual(result.violations, ['unresolved-design-scaffold']);
});

test('normalizes CRLF and LF before freezing legacy checksums', () => {
  const lf = `${publicImports}\nexport function Example() { return <Text>Ready</Text>; }\n`;
  const crlf = lf.replace(/\n/g, '\r\n');

  assert.equal(
    inspectUiFile('src/features/example/components/Example.tsx', lf).sha256,
    inspectUiFile('src/features/example/components/Example.tsx', crlf).sha256,
  );
});
