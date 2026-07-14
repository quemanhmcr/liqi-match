const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const repositoryRoot = path.resolve(__dirname, '..', '..');
const relativePath =
  'supabase/migrations/202607140058_core_v2_conversation_authority.sql';

function fail(message) {
  console.error(`Conversation SQL v2 parse failed: ${message}`);
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
    if (closing < 0) throw new Error(`Unclosed function body near byte ${start}.`);
    const semicolon = candidate.indexOf(';', closing + delimiter.length);
    if (semicolon < 0) {
      throw new Error(`Function lacks terminating semicolon near byte ${start}.`);
    }
    const end = start + semicolon + 1;
    return {
      start,
      end,
      body: sql.slice(start + bodyStart, start + closing),
      sql: sql.slice(start, end),
      language: /\blanguage\s+plpgsql\b/i.test(candidate.slice(0, semicolon))
        ? 'plpgsql'
        : /\blanguage\s+sql\b/i.test(candidate.slice(0, semicolon))
          ? 'sql'
          : 'other',
    };
  });
}

async function parseOuterSegments(sql, functions) {
  const segments = [];
  let cursor = 0;
  for (const fn of functions) {
    if (fn.start > cursor) segments.push(sql.slice(cursor, fn.start));
    cursor = fn.end;
  }
  if (cursor < sql.length) segments.push(sql.slice(cursor));

  let statements = 0;
  for (const [index, segment] of segments.entries()) {
    if (!segment.trim()) continue;
    const parser = await PgQueryModule();
    const result = parser.parse(segment);
    if (result.error?.message) {
      fail(`${relativePath}: outer segment ${index + 1}: ${result.error.message}`);
    }
    statements += result.parse_tree?.stmts?.length ?? 0;
  }
  return statements;
}

(async () => {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath} is missing.`);
    return;
  }
  const sql = fs.readFileSync(absolutePath, 'utf8');
  const functions = functionStatements(sql);
  const outerStatements = await parseOuterSegments(sql, functions);

  let sqlFunctions = 0;
  let plpgsqlFunctions = 0;
  for (const [index, fn] of functions.entries()) {
    const parser = await PgQueryModule();
    if (fn.language === 'plpgsql') {
      const result = parser.parsePlpgsql(fn.sql);
      if (result.error?.message) {
        fail(`${relativePath}: PL/pgSQL function ${index + 1}: ${result.error.message}`);
      }
      plpgsqlFunctions += 1;
    } else if (fn.language === 'sql') {
      const result = parser.parse(fn.body);
      if (result.error?.message) {
        fail(`${relativePath}: SQL function ${index + 1}: ${result.error.message}`);
      }
      sqlFunctions += 1;
    }
  }

  console.log(
    `${relativePath}: ${outerStatements} outer statements, ${sqlFunctions} SQL functions, ${plpgsqlFunctions} PL/pgSQL functions parsed in segments.`,
  );
  if (!process.exitCode) console.log('Conversation SQL v2 parsing passed.');
})().catch((error) => fail(error instanceof Error ? error.stack ?? error.message : String(error)));
