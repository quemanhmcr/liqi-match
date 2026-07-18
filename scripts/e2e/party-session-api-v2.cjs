const { randomUUID } = require('node:crypto');
const {
  E2E_DISPOSABLE_PROJECT,
  assertUrlProjectTarget,
} = require('../supabase/project-registry.cjs');

class PartySessionApiE2eError extends Error {
  constructor(message, code = 'e2e_failed', details = null) {
    super(message);
    this.name = 'PartySessionApiE2eError';
    this.code = code;
    this.details = details;
  }
}

function createRestClient({ apiKey, baseUrl, fetchImpl = fetch, token }) {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async rpc(name, body = {}) {
      const response = await fetchImpl(`${root}/rest/v1/rpc/${name}`, {
        body: JSON.stringify(body),
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const text = await response.text();
      const payload = text ? safeJson(text) : null;
      if (!response.ok) {
        const authority = parseAuthorityError(payload);
        throw new PartySessionApiE2eError(
          `${name} failed (${response.status}): ${authority.message}`,
          authority.code,
          authority.details,
        );
      }
      return payload;
    },
  };
}

async function runPartySessionApiE2e(input) {
  const startedAt = input.now().toISOString();
  const runId = input.runId();
  try {
    const result = await executePartySessionApiE2e({
      ...input,
      fixedRunId: runId,
      fixedStartedAt: startedAt,
    });
    await recordApiE2eEvidence(input, result);
    return result;
  } catch (error) {
    await recordApiE2eFailure(input, {
      completedAt: input.now().toISOString(),
      report: {
        code:
          error instanceof PartySessionApiE2eError
            ? error.code
            : 'unexpected_error',
        message: error instanceof Error ? error.message : String(error),
      },
      runId,
      startedAt,
      status: 'failed',
    });
    throw error;
  }
}

async function executePartySessionApiE2e(input) {
  const startedAt = input.fixedStartedAt;
  const uuid = input.uuid ?? randomUUID;
  const runId = input.fixedRunId;
  const deviceA = createRestClient({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    token: input.accessTokenA,
  });
  const deviceB = createRestClient({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    token: input.accessTokenB,
  });
  const [contextA, contextB] = await Promise.all([
    deviceA.rpc('get_authenticated_player_v1'),
    deviceB.rpc('get_authenticated_player_v1'),
  ]);
  const identityA = authenticatedIdentity(contextA, 'A');
  const identityB = authenticatedIdentity(contextB, 'B');
  if (identityA.playerId === identityB.playerId) {
    throw new PartySessionApiE2eError(
      'E2E devices must use distinct PlayerIds.',
    );
  }

  let commandSequence = 0;
  const metadata = (expectedVersion) => {
    commandSequence += 1;
    return {
      p_audit: {
        appVersion: 'party-session-api-e2e',
        clientCreatedAt: input.now().toISOString(),
        clientRequestId: uuid(),
        deviceInstallationId: uuid(),
        platform: 'web',
      },
      p_correlation_id: uuid(),
      p_expected_version: expectedVersion,
      p_idempotency_key: `party-session-e2e.${runId}.${commandSequence}`,
    };
  };

  const createCommand = {
    ...metadata(0),
    p_capacity: 2,
    p_initial_invitee_player_ids: [identityB.playerId],
    p_scheduled_for: null,
    p_timezone: input.timezone ?? 'Asia/Bangkok',
    p_title: input.title ?? `Party Session E2E ${runId.slice(0, 8)}`,
  };
  const created = await deviceA.rpc('create_play_session_v2', createCommand);
  assertReceipt(created, 'create_play_session_v2', 'created', false);
  const sessionId = created.aggregateId;
  const replay = await deviceA.rpc('create_play_session_v2', createCommand);
  assertReceipt(replay, 'create_play_session_v2', 'created', true);
  if (replay.aggregateId !== sessionId) {
    throw new PartySessionApiE2eError(
      'Create replay returned another SessionId.',
    );
  }

  const invites = await deviceB.rpc('list_my_session_invites_v2', {
    p_limit: 50,
  });
  const invite = (invites ?? []).find((item) => item.sessionId === sessionId);
  if (!invite || invite.targetPlayerId !== identityB.playerId) {
    throw new PartySessionApiE2eError(
      'Device B did not receive the Session invite.',
    );
  }
  const accepted = await deviceB.rpc('accept_session_invite_v2', {
    ...metadata(invite.session.version),
    p_invite_id: invite.inviteId,
    p_session_id: sessionId,
  });
  assertReceipt(accepted, 'accept_session_invite_v2', 'invite_accepted', false);

  let snapshot = await pollUntil(
    'accepted membership and communication projection',
    () => deviceA.rpc('get_play_session_v2', { p_session_id: sessionId }),
    (value) =>
      activeMemberIds(value).includes(identityB.playerId) &&
      value?.communication?.status === 'ready',
    input,
  );
  const opened = await deviceA.rpc('open_ready_check_v2', {
    ...metadata(snapshot.version),
    p_deadline_at: new Date(input.now().getTime() + 5 * 60_000).toISOString(),
    p_session_id: sessionId,
  });
  assertReceipt(opened, 'open_ready_check_v2', 'ready_check_opened', false);
  const checkId = opened.session?.readyCheck?.checkId;
  if (!checkId) throw new PartySessionApiE2eError('ReadyCheckId is missing.');

  const readyA = await deviceA.rpc('respond_ready_check_v2', {
    ...metadata(opened.aggregateVersion),
    p_check_id: checkId,
    p_response: 'ready',
    p_session_id: sessionId,
  });
  assertReceipt(readyA, 'respond_ready_check_v2', 'member_ready', false);

  let staleRejected = false;
  try {
    await deviceB.rpc('respond_ready_check_v2', {
      ...metadata(opened.aggregateVersion),
      p_check_id: checkId,
      p_response: 'ready',
      p_session_id: sessionId,
    });
  } catch (error) {
    if (
      error instanceof PartySessionApiE2eError &&
      error.code === 'version_conflict'
    ) {
      staleRejected = true;
    } else {
      throw error;
    }
  }
  if (!staleRejected) {
    throw new PartySessionApiE2eError('Stale ready response was not rejected.');
  }

  snapshot = await deviceB.rpc('get_play_session_v2', {
    p_session_id: sessionId,
  });
  const readyB = await deviceB.rpc('respond_ready_check_v2', {
    ...metadata(snapshot.version),
    p_check_id: checkId,
    p_response: 'ready',
    p_session_id: sessionId,
  });
  assertReceipt(readyB, 'respond_ready_check_v2', 'ready_check_passed', false);

  const started = await deviceA.rpc('start_session_v2', {
    ...metadata(readyB.aggregateVersion),
    p_session_id: sessionId,
  });
  assertReceipt(started, 'start_session_v2', 'started', false);
  const claimA = await deviceA.rpc('propose_session_completion_v2', {
    ...metadata(started.aggregateVersion),
    p_claim: 'completed',
    p_reason_code: null,
    p_session_id: sessionId,
  });
  assertReceipt(
    claimA,
    'propose_session_completion_v2',
    'completion_pending',
    false,
  );
  const claimB = await deviceB.rpc('propose_session_completion_v2', {
    ...metadata(claimA.aggregateVersion),
    p_claim: 'completed',
    p_reason_code: null,
    p_session_id: sessionId,
  });
  assertReceipt(claimB, 'propose_session_completion_v2', 'completed', false);

  const restartedDeviceB = createRestClient({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    token: input.accessTokenB,
  });
  const restored = await restartedDeviceB.rpc('get_play_session_v2', {
    p_session_id: sessionId,
  });
  if (
    restored?.state !== 'completed' ||
    activeMemberIds(restored).sort().join(',') !==
      [identityA.playerId, identityB.playerId].sort().join(',')
  ) {
    throw new PartySessionApiE2eError(
      'Restart did not restore completed authoritative Session facts.',
    );
  }

  return {
    completedAt: input.now().toISOString(),
    report: {
      communicationStatus: restored.communication.status,
      finalVersion: restored.version,
      membershipVersion: restored.membershipVersion,
      participantPlayerIds: activeMemberIds(restored),
      staleVersionRejected: true,
    },
    runId,
    sessionId,
    startedAt,
    status: 'passed',
  };
}

async function recordApiE2eEvidence(input, result) {
  if (!input.serviceRoleKey) return;
  const operator = createRestClient({
    apiKey: input.serviceRoleKey,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    token: input.serviceRoleKey,
  });
  await operator.rpc('record_party_session_api_e2e_result_v2', {
    p_completed_at: result.completedAt,
    p_report: result.report,
    p_run_id: result.runId,
    p_started_at: result.startedAt,
    p_status: result.status,
  });
}

async function recordApiE2eFailure(input, result) {
  if (!input.serviceRoleKey) return;
  try {
    await recordApiE2eEvidence(input, result);
  } catch (recordError) {
    if (result.report && typeof result.report === 'object') {
      result.report.evidenceRecordError = String(recordError);
    }
  }
}

function assertReceipt(receipt, commandName, resultCode, repeated) {
  if (
    receipt?.commandName !== commandName ||
    receipt?.resultCode !== resultCode ||
    receipt?.repeated !== repeated ||
    receipt?.aggregateType !== 'play_session' ||
    !receipt?.aggregateId ||
    !Number.isInteger(receipt?.aggregateVersion)
  ) {
    throw new PartySessionApiE2eError(
      `Invalid ${commandName} receipt for ${resultCode}.`,
    );
  }
}

function activeMemberIds(snapshot) {
  return (snapshot?.members ?? [])
    .filter((member) => member.state === 'active')
    .map((member) => member.playerId);
}

function authenticatedIdentity(context, label) {
  const principal = context?.principal;
  const lifecycle = context?.lifecycle;
  if (
    !principal?.accountId ||
    !principal?.playerId ||
    lifecycle?.playerId !== principal.playerId ||
    lifecycle?.state !== 'active'
  ) {
    throw new PartySessionApiE2eError(
      `Device ${label} has no consistent active identity.`,
    );
  }
  return { accountId: principal.accountId, playerId: principal.playerId };
}

async function pollUntil(label, operation, predicate, input) {
  const attempts = input.pollAttempts ?? 30;
  const intervalMs = input.pollIntervalMs ?? 1_000;
  const sleep =
    input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await operation();
      if (predicate(value)) return value;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(intervalMs);
  }
  throw new PartySessionApiE2eError(
    `${label} was not observed${lastError instanceof Error ? `: ${lastError.message}` : ''}.`,
  );
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseAuthorityError(payload) {
  const raw = payload && typeof payload === 'object' ? payload.message : null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return {
        code: parsed.code ?? 'rpc_failed',
        details: parsed.details ?? null,
        message: parsed.message ?? raw,
      };
    } catch {
      return {
        code: 'rpc_failed',
        details: payload.details ?? null,
        message: raw,
      };
    }
  }
  return { code: 'rpc_failed', details: null, message: String(payload) };
}

function assertApiE2eTarget(baseUrl) {
  try {
    return assertUrlProjectTarget(baseUrl, 'e2e-disposable', 'SUPABASE_URL');
  } catch (error) {
    throw new PartySessionApiE2eError(error.message);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new PartySessionApiE2eError(`Missing environment: ${name}`);
  return value;
}

function environmentInput() {
  const baseUrl = requiredEnvironment('SUPABASE_URL');
  const target = assertApiE2eTarget(baseUrl);
  console.log(
    `API_E2E_TARGET target=${target.target} project_name=${target.projectName} project_ref=${target.projectRef}`,
  );
  return {
    accessTokenA: requiredEnvironment('PARTY_SESSION_E2E_ACCESS_TOKEN_A'),
    accessTokenB: requiredEnvironment('PARTY_SESSION_E2E_ACCESS_TOKEN_B'),
    apiKey: requiredEnvironment('SUPABASE_ANON_KEY'),
    baseUrl,
    fetchImpl: fetch,
    now: () => new Date(),
    runId: randomUUID,
    serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    uuid: randomUUID,
  };
}

if (require.main === module) {
  runPartySessionApiE2e(environmentInput())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  PartySessionApiE2eError,
  assertApiE2eTarget,
  createRestClient,
  runPartySessionApiE2e,
};
