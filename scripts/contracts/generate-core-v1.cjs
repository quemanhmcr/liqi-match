const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');
const { compile } = require('json-schema-to-typescript');
const { jsonSchemaToZod } = require('json-schema-to-zod');
const prettier = require('prettier');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const contractsRoot = path.join(repositoryRoot, 'contracts', 'core-v1');
const generatedRoot = path.join(
  repositoryRoot,
  'src',
  'features',
  'messages',
  'contracts',
  'generated',
);
const compatibilityPath = path.join(
  contractsRoot,
  'compatibility',
  'conversation-v1.report.json',
);
const checkOnly = process.argv.includes('--check');

async function listFiles(root, predicate) {
  const result = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (predicate(absolute)) result.push(absolute);
    }
  }
  await visit(root);
  return result.sort();
}

function normalizedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function formatTypeScript(source) {
  return prettier.format(source, {
    parser: 'typescript',
    singleQuote: true,
    trailingComma: 'all',
  });
}

async function createArtifacts() {
  const schemaFiles = await listFiles(contractsRoot, (file) =>
    file.endsWith('.schema.json'),
  );
  const schemas = new Map();

  for (const file of schemaFiles) {
    const schema = JSON.parse(await fs.readFile(file, 'utf8'));
    const name = path.basename(file, '.schema.json');
    if (!schema.title || typeof schema.title !== 'string') {
      throw new Error(
        `${path.relative(repositoryRoot, file)} is missing title.`,
      );
    }
    schemas.set(name, { file, schema });
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validators = new Map();
  for (const [name, { file, schema }] of schemas) {
    try {
      validators.set(name, ajv.compile(schema));
    } catch (error) {
      throw new Error(
        `Invalid schema ${path.relative(repositoryRoot, file)}: ${error.message}`,
      );
    }
  }

  const artifacts = new Map();
  const exportLines = [];
  for (const [name, { schema }] of schemas) {
    const title = schema.title;
    const types = await compile(schema, title, {
      bannerComment:
        '/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */',
      additionalProperties: false,
      enableConstEnums: false,
      format: false,
      unknownAny: true,
    });
    const zod = jsonSchemaToZod(schema, {
      depth: 24,
      module: 'esm',
      name: `${title}Schema`,
      type: title,
      withJsdocs: true,
      zodVersion: 4,
    });

    artifacts.set(`${name}.types.ts`, await formatTypeScript(types));
    const lintBanner = zod.includes(' == ')
      ? '/* eslint-disable eqeqeq -- json-schema-to-zod emits loose equality for uniqueItems. */\n'
      : '';
    artifacts.set(
      `${name}.schema.ts`,
      await formatTypeScript(
        `/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */\n${lintBanner}${zod}\n`,
      ),
    );
    exportLines.push(`export type { ${title} } from './${name}.types';`);
    exportLines.push(`export { ${title}Schema } from './${name}.schema';`);
  }
  artifacts.set(
    'index.ts',
    await formatTypeScript(
      `/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */\n${exportLines.join('\n')}\n`,
    ),
  );

  const fixtureFiles = await listFiles(
    contractsRoot,
    (file) =>
      file.includes(`${path.sep}fixtures${path.sep}`) && file.endsWith('.json'),
  );
  let fixtureCaseCount = 0;
  const fixtureCounts = { consumer: 0, provider: 0 };
  for (const file of fixtureFiles) {
    const fixture = JSON.parse(await fs.readFile(file, 'utf8'));
    if (fixture.fixtureVersion !== 1 || !Array.isArray(fixture.cases)) {
      throw new Error(
        `Invalid fixture envelope: ${path.relative(repositoryRoot, file)}`,
      );
    }
    const kind = file.includes(`${path.sep}provider${path.sep}`)
      ? 'provider'
      : 'consumer';
    fixtureCounts[kind] += 1;
    for (const [index, testCase] of fixture.cases.entries()) {
      const validate = validators.get(testCase.schema);
      if (!validate) {
        throw new Error(
          `${path.relative(repositoryRoot, file)} case ${index} references unknown schema ${testCase.schema}.`,
        );
      }
      fixtureCaseCount += 1;
      if (!validate(testCase.data)) {
        throw new Error(
          `${path.relative(repositoryRoot, file)} case ${index} violates ${testCase.schema}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`,
        );
      }
    }
  }

  const schemaHashes = {};
  for (const [name, { schema }] of schemas) {
    schemaHashes[name] = sha256(normalizedJson(schema));
  }
  const report = {
    contractFamily: 'conversation-v1',
    fixtureCaseCount,
    fixtureCounts,
    schemaCount: schemas.size,
    schemaHashes,
    status: 'compatible',
  };

  return { artifacts, report: normalizedJson(report) };
}

async function assertFile(file, expected) {
  let actual;
  try {
    actual = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Missing generated artifact: ${path.relative(repositoryRoot, file)}`,
      );
    }
    throw error;
  }
  if (actual !== expected) {
    throw new Error(
      `Generated artifact is stale: ${path.relative(repositoryRoot, file)}. Run npm run contracts:generate.`,
    );
  }
}

async function main() {
  const { artifacts, report } = await createArtifacts();
  if (checkOnly) {
    for (const [name, content] of artifacts) {
      await assertFile(path.join(generatedRoot, name), content);
    }
    await assertFile(compatibilityPath, report);
    console.log(
      `Core v1 contracts valid: ${artifacts.size - 1} generated schema/type artifacts checked.`,
    );
    return;
  }

  await fs.rm(generatedRoot, { force: true, recursive: true });
  await fs.mkdir(generatedRoot, { recursive: true });
  for (const [name, content] of artifacts) {
    await fs.writeFile(path.join(generatedRoot, name), content, 'utf8');
  }
  await fs.mkdir(path.dirname(compatibilityPath), { recursive: true });
  await fs.writeFile(compatibilityPath, report, 'utf8');
  console.log(
    `Generated ${artifacts.size - 1} Conversation v1 schema/type artifacts and compatibility report.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
