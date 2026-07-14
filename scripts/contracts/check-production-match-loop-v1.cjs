const fs = require('node:fs');

const test = fs.readFileSync(
  'supabase/tests/database/production_match_loop_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

const activationA = test.indexOf('create temporary table loop_intent_a');
const activationB = test.indexOf('create temporary table loop_intent_b');
const discoveryA = test.indexOf('create temporary table loop_discovery_a');
const firstLike = test.indexOf('create temporary table loop_like_a');
const discoveryB = test.indexOf('create temporary table loop_discovery_b');
const reciprocalLike = test.indexOf('create temporary table loop_like_b');
const retries = test.indexOf('create temporary table loop_like_a_retry');
const homeFacts = test.indexOf('create temporary table loop_home_b');

requireInvariant(
  activationA >= 0 &&
    activationA < activationB &&
    activationB < discoveryA &&
    discoveryA < firstLike &&
    firstLike < discoveryB &&
    discoveryB < reciprocalLike &&
    reciprocalLike < retries &&
    retries < homeFacts,
  'walking skeleton must execute active intents → discovery → mutual like → retry → Home facts in order',
);
requireInvariant(
  test.includes('list_discovery_candidates_v1') &&
    test.includes('record_player_decision_v1'),
  'walking skeleton must use authoritative Discovery and decision RPCs',
);
requireInvariant(
  test.includes("event_type = 'match.created.v1'") &&
    test.includes("event_type = 'conversation.bootstrap_requested.v1'"),
  'walking skeleton must assert one Match and one conversation bootstrap request',
);
requireInvariant(
  test.includes('Mission 2 does not create a conversation directly') &&
    test.includes("'conversation_pending'"),
  'walking skeleton must preserve the Match/Conversation ownership boundary',
);
requireInvariant(
  test.includes('reciprocal retry returns the same canonical MatchId') &&
    test.includes('retries do not emit duplicate walking-skeleton events'),
  'walking skeleton must assert semantic retry idempotency',
);
requireInvariant(
  test.includes('list_home_match_facts_v1') &&
    test.includes(
      'Home cannot message before the conversation-ready projection',
    ),
  'walking skeleton must expose authoritative pending Home facts',
);
requireInvariant(
  test.includes('contract_version <> 1') &&
    test.includes('private.command_receipts_v1'),
  'walking skeleton must verify Core V1 events and durable command receipts',
);

const assertionCount = (
  test.match(/select\s+(?:is|isnt|ok|throws_ok|throws_like)\s*\(/gi) ?? []
).length;
const plannedCount = Number(test.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

if (failures.length) {
  console.error(
    `Production Match Loop v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Production Match Loop v1 check passed (${assertionCount} pgTAP assertions).`,
);
