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
const sessionContract = fs.readFileSync(
  path.join(root, 'party', 'play-session.ts'),
  'utf8',
);
const sessionEvents = fs.readFileSync(
  path.join(root, 'events', 'session-events.ts'),
  'utf8',
);
const sessionMemberJoinedFixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'fixtures', 'provider', 'session-member-joined.json'),
    'utf8',
  ),
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
const productionAdapter = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/features/messages/services/supabase-conversation-adapter.ts',
  ),
  'utf8',
);
const applicationServices = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/app-shell/runtime/create-application-services.ts',
  ),
  'utf8',
);
const messageContracts = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/features/messages/contracts/messages-contracts.ts',
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
  ['provider', manifest.supplierFixtures],
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
  'conversation.source_bound.v2',
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
  'ConversationRelationshipProjection',
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
  providers.includes('applyRelationshipEvent') &&
    contract.includes('RelationshipConversationAccessEventV2Schema') &&
    contract.includes('PlayerBlockedEventV2Schema') &&
    contract.includes('PlayerMutedEventV2Schema'),
  'Conversation must consume canonical relationship block/mute events through an explicit projection seam',
);
requireInvariant(
  /sourceType[\s\S]*direct_match[\s\S]*friendship[\s\S]*play_session[\s\S]*system/.test(
    contract,
  ),
  'conversation source contract must cover direct match, friendship, play session, and system',
);
requireInvariant(
  /sourceType: z\.literal\('play_session'\)[\s\S]*sourceId: PlaySessionIdSchema[\s\S]*sourceAggregateVersion/.test(
    contract,
  ),
  'play_session conversation sources must use canonical PlaySessionId and sourceAggregateVersion',
);
requireInvariant(
  /membership: PlaySessionMembershipProjectionV2Schema/.test(contract) &&
    /acceptedSourceAggregateVersion/.test(contract) &&
    /acceptedMembership/.test(contract),
  'session provision/reconcile receipts must echo the accepted aggregate version and full membership snapshot',
);
requireInvariant(
  /membershipVersion/.test(sessionContract) &&
    /SessionMemberJoinedEventV2Schema/.test(sessionEvents) &&
    Number.isInteger(sessionMemberJoinedFixture.aggregateVersion) &&
    Number.isInteger(
      sessionMemberJoinedFixture.payload?.membership?.membershipVersion,
    ) &&
    sessionMemberJoinedFixture.aggregateVersion === 2 &&
    sessionMemberJoinedFixture.payload.membership.membershipVersion === 2,
  'Senior 2 session events must preserve independent aggregate and membership versions',
);
requireInvariant(
  !/sourceId: SessionIdSchema/.test(contract),
  'Conversation V2 must not reuse the Core V1 authentication SessionId for play sessions',
);
requireInvariant(
  !/auth\.uid\(\)/.test(contract + providers),
  'Core V2 mobile/domain contracts must not treat auth.uid() as PlayerId',
);
requireInvariant(
  /Mobile clients cannot add members/.test(adr) &&
    /Core V1 resolves the authenticated account/.test(adr) &&
    /public history fetch, send, realtime subscription/.test(adr) &&
    /privileged moderation seam/.test(adr) &&
    /Delivery recipients and push recipients/.test(adr) &&
    /source aggregate version/.test(adr) &&
    /membership version/.test(adr) &&
    /accepted membership snapshot/.test(adr) &&
    /player\.blocked\.v2/.test(adr) &&
    /player\.unblocked\.v2` never restores access/.test(adr) &&
    /Observed event versions prevent an older snapshot/.test(adr),
  'ADR must preserve supplier-owned membership and Core V1 identity authority',
);

requireInvariant(
  applicationServices.includes(
    'relationshipCapabilitiesProvider: relationshipRepository',
  ),
  'API composition must inject the canonical relationship capability provider',
);
for (const semantic of [
  'relationshipCapabilitiesProvider.getRelationship',
  'peerByConversation',
  'sessionEpoch',
  'mapWithConcurrency(page.items, 5',
]) {
  requireInvariant(
    productionAdapter.includes(semantic),
    `production conversation authorization missing ${semantic}`,
  );
}
requireInvariant(
  /authorizeConversation\([\s\S]*command\.conversationId,[\s\S]*'message'/.test(
    productionAdapter,
  ),
  'production message commands must re-authorize relationship access',
);
requireInvariant(
  /authorizeConversation\([\s\S]*command\.conversationId,[\s\S]*'view'/.test(
    productionAdapter,
  ),
  'production read commands must re-authorize relationship access',
);
for (const code of [
  'relationship_access_revoked',
  'relationship_access_unavailable',
]) {
  requireInvariant(
    messageContracts.includes(`'${code}'`) && productionAdapter.includes(code),
    `missing stable relationship access code ${code}`,
  );
}
requireInvariant(
  /caches only the[\s\S]*PlayerId/.test(adr) &&
    /every inbox\/detail\/timeline\/read\/send\/media and[\s\S]*reads fresh/.test(
      adr,
    ) &&
    /session epoch/.test(adr),
  'ADR must document fresh capabilities and account-scoped authorization',
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
  `Conversation V2 contract check passed (${manifest.providerFixtures.length} provider fixtures, ${manifest.consumerFixtures.length} consumer fixtures, ${manifest.supplierFixtures.length} supplier fixtures).`,
);
