const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const repositoryRoot = path.resolve(__dirname, '..', '..');
const sqlPaths = [
  'supabase/migrations/202607140054_core_v2_party_play_session_foundation.sql',
  'supabase/migrations/202607141200_core_v2_play_session_walking_skeleton.sql',
  'supabase/migrations/202607141210_core_v2_match_set_commands.sql',
  'supabase/migrations/202607141220_core_v2_match_set_membership.sql',
  'supabase/migrations/202607141230_core_v2_play_session_commands.sql',
];

function fail(message) {
  console.error(`Party/Session SQL v2 parse failed: ${message}`);
  process.exitCode = 1;
}

function functionStatements(sql) {
  const starts = [
    ...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\b/gi),
  ].map((match) => match.index);
  return starts.map((start, index) => {
    const candidate = sql.slice(start, starts[index + 1] ?? sql.length);
    const bodyMatch = /\bas\s+(\$[A-Za-z0-9_]*\$)/i.exec(candidate);
    if (!bodyMatch || bodyMatch.index === undefined) {
      throw new Error(`Cannot find function body near byte ${start}.`);
    }
    const delimiter = bodyMatch[1];
    const bodyStart = bodyMatch.index + bodyMatch[0].length;
    const closing = candidate.indexOf(delimiter, bodyStart);
    if (closing < 0) {
      throw new Error(`Unclosed function body near byte ${start}.`);
    }
    const semicolon = candidate.indexOf(';', closing + delimiter.length);
    if (semicolon < 0) {
      throw new Error(
        `Function lacks terminating semicolon near byte ${start}.`,
      );
    }
    const statement = candidate.slice(0, semicolon + 1);
    return {
      body: candidate.slice(bodyStart, closing),
      end: start + semicolon + 1,
      language: /\blanguage\s+plpgsql\b/i.test(statement)
        ? 'plpgsql'
        : /\blanguage\s+sql\b/i.test(statement)
          ? 'sql'
          : 'other',
      name: /function\s+([^\s(]+)/i.exec(statement)?.[1] ?? `function@${start}`,
      sql: statement,
      start,
    };
  });
}

function nonFunctionSql(sql, functions) {
  let cursor = 0;
  let remainder = '';
  for (const fn of functions) {
    remainder += sql.slice(cursor, fn.start);
    cursor = fn.end;
  }
  return remainder + sql.slice(cursor);
}

async function parseSql(sql, label) {
  const parser = await PgQueryModule();
  const result = parser.parse(sql);
  if (result.error?.message) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.parse_tree?.stmts?.length ?? 0;
}

(async () => {
  for (const relativePath of sqlPaths) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`${relativePath} is missing.`);
      continue;
    }

    const sql = fs.readFileSync(absolutePath, 'utf8');
    const functions = functionStatements(sql);
    const remainder = nonFunctionSql(sql, functions);
    let statementCount = await parseSql(
      remainder,
      `${relativePath}: non-function statements`,
    );
    let sqlFunctions = 0;
    let plpgsqlFunctions = 0;

    for (const fn of functions) {
      statementCount += await parseSql(
        fn.sql,
        `${relativePath}: ${fn.name} declaration`,
      );
      if (fn.language === 'plpgsql') {
        const parser = await PgQueryModule();
        const result = parser.parsePlpgsql(fn.sql);
        if (result.error?.message) {
          fail(`${relativePath}: ${fn.name}: ${result.error.message}`);
        }
        plpgsqlFunctions += 1;
      } else if (fn.language === 'sql') {
        await parseSql(fn.body, `${relativePath}: ${fn.name} SQL body`);
        sqlFunctions += 1;
      }
    }

    console.log(
      `${relativePath}: ${statementCount} statements, ${sqlFunctions} SQL functions, ${plpgsqlFunctions} PL/pgSQL functions parsed in isolated segments.`,
    );
  }
  if (!process.exitCode) {
    console.log('Party/Session SQL v2 parsing passed.');
  }
})().catch((error) =>
  fail(error instanceof Error ? error.message : String(error)),
);
