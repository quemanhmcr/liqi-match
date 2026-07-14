const fs = require('node:fs');
const path = require('node:path');

const root = path.join(process.cwd(), 'contracts', 'core-v2');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'compatibility-manifest.json'), 'utf8'),
);
const contract = fs.readFileSync(
  path.join(root, 'conversation', 'conversation.ts'),
  'utf8',
);
const providers = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/entities/conversation-v2/conversation-v2-provider.ts',
  ),
  'utf8',
);
const adr = fs.readFileSync(
  path.join(
    process.cwd(),
    'docs/adr/0005-core-v2-conversation-source-membership.md',
  ),
  'utf8',
);
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

requireInvariant(
  manifest.version === 2 && manifest.status === 'additive',
  'Core V2 compatibility manifest must remain additive and version 2',
);
requireInvariant(
  manifest.owner === 'senior-3' && manifest.checkpoint === 'S3.1',
  'Conversation V2 manifest must identify the S3.1 supplier checkpoint',
);
for (const [group, names] of [
  ['provider', manifest.providerFixtures],
  ['consumer', manifest.consumerFixtures],
]) {
  for (const name of names) {
    const file = path.join(root, 'fixtures', group, name);
    requireInvariant(fs.existsSync(file), `missing fixture ${group}/${name}`);
    if (fs.existsSync(file)) JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}

for (const command of [
  'provision_direct_conversation_v2',
  'provision_session_conversation_v2',
  'send_message_v2',
  'send_media_message_v2',
  'advance_read_cursor_v2',
  'mute_conversation_v2',
  'unmute_conversation_v2',
  'reconcile_conversation_membership_v2',
  'tombstone_conversation_v2',
]) {
  requireInvariant(
    contract.includes(`'${command}'`),
    `missing command ${command}`,
  );
}
for (const event of [
  'conversation.provisioned.v2',
  'conversation.member_added.v2',
  'conversation.member_removed.v2',
  'message.sent.v2',
  'message.delivered.v2',
  'conversation.read_advanced.v2',
  'conversation.muted.v2',
  'conversation.access_revoked.v2',
]) {
  requireInvariant(contract.includes(`'${event}'`), `missing event ${event}`);
}
for (const provider of [
  'ConversationRepository',
  'ConversationProvisioningService',
  'ConversationMembershipProjection',
  'MessageTransport',
  'ConversationNotificationProvider',
  'ConversationAccessProvider',
]) {
  requireInvariant(
    providers.includes(`interface ${provider}`),
    `missing provider interface ${provider}`,
  );
}
requireInvariant(
  /sourceType[\s\S]*direct_match[\s\S]*friendship[\s\S]*play_session[\s\S]*system/.test(
    contract,
  ),
  'conversation source contract must cover direct match, friendship, play session, and system',
);
requireInvariant(
  !/auth\.uid\(\)/.test(contract + providers),
  'Core V2 mobile/domain contracts must not treat auth.uid() as PlayerId',
);
requireInvariant(
  /Mobile clients cannot add members/.test(adr) &&
    /Core V1 resolves the authenticated account/.test(adr),
  'ADR must preserve supplier-owned membership and Core V1 identity authority',
);

if (failures.length) {
  console.error(
    `Conversation V2 contract check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Conversation V2 contract check passed (${manifest.providerFixtures.length} provider fixtures, ${manifest.consumerFixtures.length} consumer fixtures).`,
);
