#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const migrationFiles = fs
  .readdirSync(migrationDirectory, { withFileTypes: true })
  .filter(
    (entry) => entry.isFile() && /^\d{12}_[a-z0-9_]+\.sql$/.test(entry.name),
  )
  .map((entry) => entry.name)
  .sort();

function postgresStatements(sql) {
  const statements = [];
  let current = '';
  let index = 0;
  let mode = 'normal';
  let dollarTag = null;
  let blockCommentDepth = 0;

  const push = () => {
    if (current.trim()) statements.push(current);
    current = '';
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (mode === 'line-comment') {
      current += char;
      index += 1;
      if (char === '\n') mode = 'normal';
      continue;
    }

    if (mode === 'block-comment') {
      if (char === '/' && next === '*') {
        blockCommentDepth += 1;
        current += '/*';
        index += 2;
        continue;
      }
      if (char === '*' && next === '/') {
        blockCommentDepth -= 1;
        current += '*/';
        index += 2;
        if (blockCommentDepth === 0) mode = 'normal';
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (mode === 'single-quote') {
      current += char;
      index += 1;
      if (char === "'" && sql[index] === "'") {
        current += sql[index];
        index += 1;
      } else if (char === "'") {
        mode = 'normal';
      }
      continue;
    }

    if (mode === 'double-quote') {
      current += char;
      index += 1;
      if (char === '"' && sql[index] === '"') {
        current += sql[index];
        index += 1;
      } else if (char === '"') {
        mode = 'normal';
      }
      continue;
    }

    if (mode === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        mode = 'normal';
        dollarTag = null;
      } else {
        current += char;
        index += 1;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += '--';
      index += 2;
      mode = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      current += '/*';
      index += 2;
      mode = 'block-comment';
      blockCommentDepth = 1;
      continue;
    }
    if (char === "'") {
      current += char;
      index += 1;
      mode = 'single-quote';
      continue;
    }
    if (char === '"') {
      current += char;
      index += 1;
      mode = 'double-quote';
      continue;
    }
    if (char === '$') {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length;
        mode = 'dollar-quote';
        continue;
      }
    }
    current += char;
    index += 1;
    if (char === ';') push();
  }

  if (mode !== 'normal' && mode !== 'line-comment') {
    throw new Error(`Unclosed SQL ${mode}.`);
  }
  push();
  return statements;
}

void main();

async function main() {
  const definedPrivateFunctions = new Map();
  const failures = [];

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    let statements;
    try {
      statements = postgresStatements(sql);
    } catch (error) {
      failures.push(`${file}: SQL splitting failed: ${errorMessage(error)}`);
      continue;
    }

    for (const [index, statementSql] of statements.entries()) {
      let statement;
      try {
        const parser = await new PgQueryModule();
        const result = parser.parse(statementSql);
        if (result.error?.message) throw new Error(result.error.message);
        statement = result.parse_tree.stmts[0]?.stmt;
      } catch (error) {
        failures.push(
          `${file} statement ${index + 1}: PostgreSQL parser failed: ${errorMessage(error)}`,
        );
        continue;
      }

      const definition = privateFunctionDefinition(statement);
      if (definition) {
        definedPrivateFunctions.set(definition, file);
        continue;
      }

      for (const call of privateFunctionCalls(statement)) {
        if (!definedPrivateFunctions.has(call)) {
          failures.push(`${file}: calls private.${call} before it is defined`);
        }
      }
    }
  }

  const fingerprintProvider = definedPrivateFunctions.get(
    'request_fingerprint_v1',
  );
  if (fingerprintProvider) {
    const providerSql = fs.readFileSync(
      path.join(migrationDirectory, fingerprintProvider),
      'utf8',
    );
    if (
      !/select\s+private\.command_request_hash_v1\s*\(\s*p_payload\s*\)/i.test(
        providerSql,
      )
    ) {
      failures.push(
        `${fingerprintProvider}: request_fingerprint_v1 must delegate to command_request_hash_v1`,
      );
    }
  }

  const uniqueFailures = [...new Set(failures)];
  if (uniqueFailures.length) {
    console.error(
      `Migration dependency order check failed (${uniqueFailures.length} issue${uniqueFailures.length === 1 ? '' : 's'}):`,
    );
    for (const failure of uniqueFailures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `Migration dependency order check passed (${migrationFiles.length} migrations, ${definedPrivateFunctions.size} private functions).`,
  );
}

function privateFunctionDefinition(statement) {
  const node = statement?.CreateFunctionStmt;
  if (!node) return null;
  const name = qualifiedName(node.funcname);
  return name?.schema === 'private' ? name.object : null;
}

function privateFunctionCalls(statement) {
  const calls = [];
  visit(statement, (key, value) => {
    if (key !== 'FuncCall') return;
    const name = qualifiedName(value?.funcname);
    if (name?.schema === 'private') calls.push(name.object);
  });
  return calls;
}

function qualifiedName(parts) {
  if (!Array.isArray(parts) || parts.length !== 2) return null;
  const values = parts.map((part) => part?.String?.sval?.toLowerCase());
  if (!values[0] || !values[1]) return null;
  return { object: values[1], schema: values[0] };
}

function visit(value, callback) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    callback(key, child);
    visit(child, callback);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
