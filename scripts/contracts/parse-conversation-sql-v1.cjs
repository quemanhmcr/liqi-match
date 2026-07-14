const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const repositoryRoot = path.resolve(__dirname, '..', '..');
const sqlPaths = [
  'supabase/migrations/202607140003_split_identity_lifecycle_profile_provider_v1.sql',
  'supabase/migrations/202607140004_request_player_deletion_v1.sql',
  'supabase/migrations/202607140005_discovery_candidate_snapshot_v1.sql',
  'supabase/migrations/202607140006_conversation_reliability_v1.sql',
  'supabase/migrations/202607140007_match_conversation_projection_v1.sql',
  'supabase/migrations/202607140008_conversation_mobile_surface_v1.sql',
  'supabase/migrations/202607140010_match_funnel_telemetry_v1.sql',
  'supabase/tests/database/conversation_reliability_v1.test.sql',
  'supabase/tests/database/secure_identity_lifecycle_v1.test.sql',
  'supabase/tests/database/discovery_candidate_snapshot_v1.test.sql',
  'supabase/tests/database/match_conversation_projection_v1.test.sql',
  'supabase/tests/database/match_funnel_telemetry_v1.test.sql',
];

function fail(message) {
  console.error(`Conversation SQL v1 parse failed: ${message}`);
  process.exitCode = 1;
}

function plpgsqlFunctions(sql) {
  const starts = [
    ...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\b/gi),
  ].map((match) => match.index);
  const functions = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const searchEnd = starts[index + 1] ?? sql.length;
    const candidate = sql.slice(start, searchEnd);
    if (!/\blanguage\s+plpgsql\b/i.test(candidate)) continue;

    const asMatch = /\bas\s+(\$[A-Za-z0-9_]*\$)/i.exec(candidate);
    if (!asMatch || asMatch.index === undefined) {
      throw new Error(`Cannot find PL/pgSQL dollar body near byte ${start}.`);
    }
    const delimiter = asMatch[1];
    const bodyStart = asMatch.index + asMatch[0].length;
    const closing = candidate.indexOf(delimiter, bodyStart);
    if (closing < 0) {
      throw new Error(`Unclosed PL/pgSQL dollar body near byte ${start}.`);
    }
    const semicolon = candidate.indexOf(';', closing + delimiter.length);
    if (semicolon < 0) {
      throw new Error(
        `PL/pgSQL function lacks a terminating semicolon near byte ${start}.`,
      );
    }
    functions.push(candidate.slice(0, semicolon + 1));
  }

  return functions;
}

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

async function parsePostgres(relativePath, sql) {
  const statements = postgresStatements(sql);
  for (const [index, statement] of statements.entries()) {
    const parser = await new PgQueryModule();
    const result = parser.parse(statement);
    if (result.error?.message) {
      throw new Error(
        `${relativePath}: PostgreSQL statement ${index + 1}: ${result.error.message}`,
      );
    }
  }
  return statements.length;
}

async function parsePlpgsql(relativePath, sql) {
  const functions = plpgsqlFunctions(sql);
  for (const [index, functionSql] of functions.entries()) {
    const parser = await new PgQueryModule();
    const result = parser.parsePlpgsql(functionSql);
    if (result.error?.message) {
      throw new Error(
        `${relativePath}: PL/pgSQL function ${index + 1}: ${result.error.message}`,
      );
    }
  }
  return functions.length;
}

(async () => {
  for (const relativePath of sqlPaths) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`${relativePath} is missing.`);
      continue;
    }

    const sql = fs.readFileSync(absolutePath, 'utf8');
    try {
      const statementCount = await parsePostgres(relativePath, sql);
      const functionCount = await parsePlpgsql(relativePath, sql);
      console.log(
        `${relativePath}: ${statementCount} PostgreSQL statements and ${functionCount} PL/pgSQL functions parsed.`,
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  if (!process.exitCode) {
    console.log('Conversation SQL v1 PostgreSQL + PL/pgSQL parsing passed.');
  }
})().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
