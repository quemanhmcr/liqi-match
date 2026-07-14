const fs = require('node:fs');
const migration = fs.readFileSync(
  'supabase/migrations/202607140038_push_delivery_presence_v1.sql',
  'utf8',
);
const worker = fs.readFileSync(
  'supabase/functions/notification-push-worker/handler.ts',
  'utf8',
);
const mobileRegistration = fs.readFileSync(
  'src/app-shell/push/push-device-registration-service.ts',
  'utf8',
);
const mobileProvider = fs.readFileSync(
  'src/app-shell/push/PushDeviceLifecycleProvider.tsx',
  'utf8',
);
const mobileRepository = fs.readFileSync(
  'src/app-shell/push/notification-device-api.repository.ts',
  'utf8',
);
const presentationController = fs.readFileSync(
  'src/app-shell/push/expo-notification-presentation-controller.ts',
  'utf8',
);
const test = fs.readFileSync(
  'supabase/tests/database/push_delivery_presence_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (value, message) => {
  if (!value) failures.push(message);
};

requireInvariant(
  /notification\.kind = 'message_received'[\s\S]*notification_presence_v1[\s\S]*active_conversation_id/i.test(
    migration,
  ),
  'Foreground suppression must be evaluated from authoritative conversation presence at claim time.',
);
requireInvariant(
  /last_error = 'foreground_conversation_suppressed'/i.test(migration),
  'Foreground suppression must be observable without deleting notifications.',
);
requireInvariant(
  /'sourceEventId', notification\.source_event_id/i.test(migration),
  'Push claim must include source EventId for the navigation contract.',
);
requireInvariant(
  /notification_push_deliveries_v1/i.test(migration) &&
    /unique \(job_id, device_id\)/i.test(migration),
  'Push provider outcomes must persist per job and device.',
);
requireInvariant(
  /DeviceNotRegistered[\s\S]*enabled = false/i.test(migration),
  'Invalid Expo tokens must be disabled from ticket or receipt responses.',
);
requireInvariant(
  /receipt_claimed_at < now\(\) - interval '5 minutes'/i.test(migration),
  'Receipt claims require a recoverable lease.',
);
requireInvariant(
  /maxMessagesPerRequest = 100/.test(worker) &&
    /maxReceiptIdsPerRequest = 1_000/.test(worker),
  'Worker must respect Expo request batch boundaries.',
);
requireInvariant(
  /contractVersion: 1[\s\S]*notificationId: job\.notificationId[\s\S]*sourceEventId: job\.sourceEventId/.test(
    worker,
  ),
  'Every push must carry the machine-readable navigation payload.',
);

requireInvariant(
  /push_worker_misconfigured/.test(worker) &&
    /PUSH_WORKER_SECRET\.trim\(\)/.test(worker) &&
    /SUPABASE_SERVICE_ROLE_KEY\.trim\(\)/.test(worker) &&
    /validHttpUrl\(env\.SUPABASE_URL\)/.test(worker),
  'Push worker must fail closed before secret comparison when required configuration is missing.',
);

requireInvariant(
  /x-internal-worker-secret/.test(worker),
  'Push worker invocation must require an internal secret.',
);
requireInvariant(
  /fail_notification_push_job_v1[\s\S]*p_retryable/.test(worker),
  'Transport failures must return jobs to authoritative retry handling.',
);
requireInvariant(
  !/delete from public\.notifications_v1/i.test(migration),
  'Push suppression or rollback must never delete persisted notifications.',
);

requireInvariant(
  /getAuthenticatedPlayer[\s\S]*context\.lifecycle\.state !== 'active'[\s\S]*getPermissionStatus/.test(
    mobileRegistration,
  ),
  'Mobile must resolve authoritative lifecycle before requesting notification permission.',
);
requireInvariant(
  /getExpoProjectId[\s\S]*missing-project-id/.test(mobileRegistration) &&
    /isPhysicalDevice[\s\S]*not-physical-device/.test(mobileRegistration),
  'Mobile registration must fail explicitly for missing projectId and simulators.',
);
requireInvariant(
  /rpc\/get_authenticated_player_v1/.test(mobileRepository) &&
    /rpc\/register_push_device_v1/.test(mobileRepository) &&
    /rpc\/unregister_push_device_v1/.test(mobileRepository) &&
    /rpc\/upsert_notification_presence_v1/.test(mobileRepository),
  'Mobile device lifecycle must use authenticated authority RPCs.',
);
requireInvariant(
  /foregroundHeartbeatMs = 45_000/.test(mobileProvider) &&
    /AppState\.addEventListener\('change'/.test(mobileProvider) &&
    /notificationPresenceService\.background/.test(mobileProvider),
  'Mobile presence must heartbeat before the 90-second server TTL and clear on background.',
);
requireInvariant(
  /pathname\.startsWith\('\/messages\/'\)/.test(mobileProvider) &&
    /ConversationIdSchema\.safeParse/.test(mobileProvider),
  'Foreground suppression must only publish a validated ConversationId on a conversation route.',
);
requireInvariant(
  /pushDeviceRegistrationService[\s\S]*unregister\(previous\.session\)/.test(
    mobileProvider,
  ),
  'Session ownership changes must best-effort unregister the previous installation.',
);
requireInvariant(
  /payload\.data\.deepLink\.target === 'conversation'[\s\S]*conversationId === this\.activeConversationId/.test(
    presentationController,
  ),
  'Local presentation may only suppress the currently open authoritative conversation.',
);

const assertionCount = (
  test.match(/select\s+(?:is|ok|isnt|throws_ok)\s*\(/gi) ?? []
).length;
const plannedCount = Number(test.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);
if (failures.length) {
  console.error(
    `Push delivery presence v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Push delivery presence v1 check passed (${assertionCount} pgTAP assertions).`,
);
