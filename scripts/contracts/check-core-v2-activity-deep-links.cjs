const fs = require('node:fs');
const m = fs.readFileSync(
  'supabase/migrations/202607141510_core_v2_activity_notification_delivery.sql',
  'utf8',
);
const d = fs.readFileSync('contracts/core-v1/deep-link/index.ts', 'utf8');
const r = fs.readFileSync('src/app-shell/deep-link/deep-link-route.ts', 'utf8');
const v = fs.readFileSync(
  'src/features/notifications/model/notification-view-model.ts',
  'utf8',
);
const s = fs.readFileSync(
  'src/features/notifications/screens/NotificationsScreen.tsx',
  'utf8',
);
const p = fs.readFileSync(
  'supabase/migrations/202607141410_core_v2_completed_session_consumer.sql',
  'utf8',
);
const tPath =
  'supabase/tests/database/core_v2_activity_notification_delivery.test.sql';
const need = (x, msg) => {
  if (!x) throw new Error(msg);
};
need(
  d.includes("target: z.literal('session_feedback')") &&
    d.includes("target: z.literal('home')"),
  'DeepLinkV1 activity targets missing',
);
need(
  r.includes("case 'session_feedback'") &&
    r.includes('appRoutes.sessions.feedback(deepLink.sessionId)') &&
    r.includes("case 'home'"),
  'Canonical route mapping missing',
);
need(
  v.includes("kind: 'session_feedback'") &&
    v.includes("kind: 'home'") &&
    s.includes("case 'session_feedback'") &&
    s.includes("case 'home'"),
  'Inbox activity routes missing',
);
need(
  !s.includes('resolveCoreV2ActivityNotificationRoute') &&
    !fs.existsSync(
      'src/app-shell/deep-link/core-v2-activity-notification-route.ts',
    ),
  'Raw push target bypass remains',
);
need(
  m.includes('private.consume_activity_notification_requested_v2') &&
    m.includes('event.contract_version = 2') &&
    m.includes("event.event_type = 'activity.notification_requested.v2'"),
  'Production dispatcher missing',
);
need(
  m.includes('private.activity_notification_events_v2') &&
    m.includes('private.activity_notification_deliveries_v2') &&
    m.includes('unique (recipient_player_id, activity_deduplication_key)'),
  'Replay/dedup authority missing',
);
need(
  m.includes('activity_dismissed_before_delivery') &&
    m.includes('suppressed_by_delivery_runtime') &&
    m.includes('suppressed_by_supplier'),
  'Suppression semantics missing',
);
need(
  m.includes(
    'actor_snapshot.player_id = any(outcome.participant_player_ids)',
  ) && m.includes('private.activity_notification_click_facts_v2'),
  'Authorized feedback/click facts missing',
);
need(
  m.includes("'notification.requested.v2'") &&
    m.includes("jsonb_build_object('receipt', receipt_value)"),
  'Provider receipt event missing',
);
need(
  !p.includes("'activityItemId', activity_row.id") &&
    !p.includes("'playerId', activity_row.player_id"),
  'Producer decision drifts from strict schema',
);
const feedbackTargetBlock = p.slice(
  p.indexOf("when 'feedback_prompt'"),
  p.indexOf("when 'reputation_progress'"),
);
need(
  feedbackTargetBlock.includes("'outcomeId', outcome_id_value") &&
    !feedbackTargetBlock.includes('jsonb_strip_nulls'),
  'Feedback target must preserve the nullable outcomeId contract key',
);
need(
  m.includes('activity_notification_click_conflict') &&
    m.includes('hashtextextended(delivery.notification_request_id::text, 0)'),
  'Click identity conflicts must fail explicitly under an advisory lock',
);
need(
  m.includes("not like '%session_feedback%'") &&
    m.includes("not like '%home%'"),
  'Legacy constraint replacement must not target the additive contract',
);
need(fs.existsSync(tPath), 'Activity delivery pgTAP missing');
const t = fs.readFileSync(tPath, 'utf8');
const plan = Number(t.match(/select plan\((\d+)\)/i)?.[1] ?? 0);
const count = [
  ...t.matchAll(/select (?:has_function|has_table|ok|is|throws_ok)\(/gi),
].length;
need(
  plan === count && count >= 24,
  `pgTAP mismatch plan=${plan} assertions=${count}`,
);
console.log(
  `Core V2 activity notification delivery check passed (${count} pgTAP assertions).`,
);
