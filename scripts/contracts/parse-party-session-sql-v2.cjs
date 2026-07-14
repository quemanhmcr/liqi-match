const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const repositoryRoot = path.resolve(__dirname, '..', '..');
const sqlPaths = [
  'supabase/migrations/202607140054_core_v2_party_play_session_foundation.sql',
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
    if (closing < 0)
      throw new Error(`Unclosed function body near byte ${start}.`);
    const semicolon = candidate.indexOf(';', closing + delimiter.length);
    if (semicolon < 0) {
      throw new Error(
        `Function lacks terminating semicolon near byte ${start}.`,
      );
    }
    return {
      body: candidate.slice(bodyStart, closing),
      sql: candidate.slice(0, semicolon + 1),
      language: /\blanguage\s+plpgsql\b/i.test(candidate)
        ? 'plpgsql'
        : /\blanguage\s+sql\b/i.test(candidate)
          ? 'sql'
          : 'other',
    };
  });
}

(async () => {
  for (const relativePath of sqlPaths) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`${relativePath} is missing.`);
      continue;
    }
    const sql = fs.readFileSync(absolutePath, 'utf8');
    const parser = await PgQueryModule();
    const outer = parser.parse(sql);
    if (outer.error?.message) {
      fail(`${relativePath}: ${outer.error.message}`);
      continue;
    }

    let sqlFunctions = 0;
    let plpgsqlFunctions = 0;
    for (const fn of functionStatements(sql)) {
      const fnParser = await new PgQueryModule();
      if (fn.language === 'plpgsql') {
        const result = fnParser.parsePlpgsql(fn.sql);
        if (result.error?.message) {
          fail(`${relativePath}: ${result.error.message}`);
        }
        plpgsqlFunctions += 1;
      } else if (fn.language === 'sql') {
        const result = fnParser.parse(fn.body);
        if (result.error?.message) {
          fail(`${relativePath}: SQL function body: ${result.error.message}`);
        }
        sqlFunctions += 1;
      }
    }

    console.log(
      `${relativePath}: ${outer.parse_tree?.stmts?.length ?? 0} statements, ${sqlFunctions} SQL functions, ${plpgsqlFunctions} PL/pgSQL functions parsed.`,
    );
  }
  if (!process.exitCode) {
    console.log('Party/Session SQL v2 parsing passed.');
  }
})().catch((error) =>
  fail(error instanceof Error ? error.message : String(error)),
);
