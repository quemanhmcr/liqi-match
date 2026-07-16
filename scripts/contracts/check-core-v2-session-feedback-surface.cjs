const fs = require('node:fs');
const migration = fs.readFileSync(
  'supabase/migrations/202607141500_session_feedback_surface_v2.sql',
  'utf8',
);
const test = fs.readFileSync(
  'supabase/tests/database/core_v2_session_feedback_surface.test.sql',
  'utf8',
);
const contract = fs.readFileSync(
  'contracts/core-v2/outcomes/session-outcomes.ts',
  'utf8',
);
const repository = fs.readFileSync(
  'src/entities/trust-outcomes/trust-outcomes-repositories.ts',
  'utf8',
);
const adapter = fs.readFileSync(
  'src/entities/trust-outcomes/supabase-trust-outcomes-engine.ts',
  'utf8',
);
const hooks = fs.readFileSync(
  'src/entities/trust-outcomes/trust-outcomes-hooks.ts',
  'utf8',
);
const screen = fs.readFileSync(
  'src/features/trust-outcomes/screens/SessionFeedbackScreen.tsx',
  'utf8',
);
const route = fs.readFileSync(
  'src/app/(app)/sessions/[sessionId]/feedback.tsx',
  'utf8',
);
const routes = fs.readFileSync('src/app-shell/navigation/routes.ts', 'utf8');
function requireInvariant(value, message) {
  if (!value) throw new Error(message);
}
requireInvariant(
  contract.includes('SessionFeedbackSurfaceV2Schema') &&
    contract.includes('endorsementTargetPlayerIds') &&
    contract.includes('allParticipantsConfirmed'),
  'Executable feedback surface contract is required',
);
requireInvariant(
  migration.includes('get_session_feedback_surface_v2') &&
    migration.includes(
      'actor_player_id_value = any(outcome_row.participant_player_ids)',
    ),
  'Feedback surface must be actor/member scoped',
);
requireInvariant(
  migration.includes("outcome_row.state = 'recorded'") &&
    migration.includes("actor_confirmation_row.status = 'confirmed'") &&
    migration.includes('all_confirmed_value'),
  'Endorsement eligibility must require recorded outcome, actor confirmation and full quorum',
);
requireInvariant(
  migration.includes('player_endorsements_v2') &&
    migration.includes('not exists'),
  'Existing endorsements must be removed from eligible targets',
);
requireInvariant(
  repository.includes('getFeedbackSurface(') &&
    adapter.includes("'get_session_feedback_surface_v2'"),
  'Provider and Supabase adapter must expose the read model',
);
requireInvariant(
  hooks.includes('useSessionFeedbackSurface') &&
    hooks.includes('useConfirmSessionParticipation') &&
    hooks.includes('useSubmitPlayerEndorsement'),
  'Feedback UI must use query/mutation provider seams',
);
requireInvariant(
  screen.includes('SessionFeedbackScreen') &&
    screen.includes('createTrustMutationMetadata') &&
    screen.includes('expectedOutcomeVersion') &&
    screen.includes('Session này chưa tạo trust tích cực'),
  'Production feedback screen must handle confirmation, endorsement and dispute fail-closed states',
);
requireInvariant(
  route.includes('useLocalSearchParams') &&
    routes.includes("pathname: '/sessions/[sessionId]/feedback'"),
  'Feedback deep link must use a typed dynamic Expo Router route',
);
const plan = Number(test.match(/select plan\((\d+)\)/i)?.[1] ?? 0);
const count = [...test.matchAll(/select (?:has_function|ok)\(/gi)].length;
requireInvariant(
  plan === count && count === 10,
  `Feedback pgTAP mismatch plan=${plan}, assertions=${count}`,
);
console.log(
  `Core V2 session feedback surface check passed (${count} pgTAP assertions).`,
);
