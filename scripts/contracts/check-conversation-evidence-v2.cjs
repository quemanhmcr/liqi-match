const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = path.resolve(__dirname, '..', '..');
const migrationRelative =
  'supabase/migrations/202607141320_conversation_report_evidence_contract_v2.sql';
const testRelative =
  'supabase/tests/database/conversation_report_evidence_v2.test.sql';
const migration = fs.readFileSync(path.join(root, migrationRelative), 'utf8');
const test = fs.readFileSync(path.join(root, testRelative), 'utf8');
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

(async () => {
  const parser = await PgQueryModule();
  const outer = parser.parse(migration);
  requireInvariant(
    !outer.error?.message,
    `${migrationRelative} PostgreSQL parse failed: ${outer.error?.message}`,
  );
  const functionStart = migration.indexOf(
    'create or replace function public.capture_message_report_evidence_v2',
  );
  const functionEnd = migration.indexOf('$$;', functionStart) + 3;
  const functionSql = migration.slice(functionStart, functionEnd);
  const functionParser = await PgQueryModule();
  const plpgsql = functionParser.parsePlpgsql(functionSql);
  requireInvariant(
    !plpgsql.error?.message,
    `${migrationRelative} PL/pgSQL parse failed: ${plpgsql.error?.message}`,
  );

  requireInvariant(
    /'message',\s*jsonb_build_object/i.test(functionSql),
    'evidence response must contain nested message object',
  );
  for (const field of [
    'messageId',
    'conversationId',
    'senderPlayerId',
    'clientMessageId',
    'sequence',
    'content',
    'createdAt',
    'tombstonedAt',
  ]) {
    requireInvariant(
      functionSql.includes(`'${field}'`),
      `nested evidence message is missing ${field}`,
    );
  }
  requireInvariant(
    !/'repeated'|'contentFingerprint'/i.test(functionSql),
    'strict evidence response must omit replay/fingerprint transport fields',
  );
  requireInvariant(
    /content_snapshot/i.test(functionSql) &&
      /client_message_id/i.test(functionSql),
    'evidence must use immutable content snapshot and canonical client message ID',
  );
  requireInvariant(
    /on conflict \(report_id\) do nothing/i.test(functionSql),
    'evidence capture must remain idempotent by report ID',
  );
  requireInvariant(
    /select plan\(4\)/i.test(test) &&
      (test.match(/select (?:has_function|ok)\s*\(/gi) ?? []).length === 4,
    'conversation evidence pgTAP plan must cover four assertions',
  );

  if (failures.length) {
    console.error('Conversation evidence v2 check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    'Conversation evidence v2 check passed with strict nested DTO and pgTAP coverage.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
