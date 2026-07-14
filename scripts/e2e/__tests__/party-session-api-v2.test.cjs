const { describe, expect, it } = require('@jest/globals');
const { runPartySessionApiE2e } = require('../party-session-api-v2.cjs');

const ids = {
  accountA: '01000000-0000-4000-8000-000000000101',
  accountB: '01000000-0000-4000-8000-000000000102',
  playerA: '21000000-0000-4000-8000-000000000101',
  playerB: '21000000-0000-4000-8000-000000000102',
  session: '71000000-0000-4000-8000-000000000101',
  invite: '72000000-0000-4000-8000-000000000101',
  check: '73000000-0000-4000-8000-000000000101',
};

function response(value, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
      status,
    }),
  );
}

function authorityError(code, message) {
  return response(
    {
      message: JSON.stringify({ code, details: {}, message, retryable: false }),
    },
    400,
  );
}

function scenarioFetch() {
  let state = 'recruiting';
  let version = 1;
  let membershipVersion = 1;
  let accepted = false;
  let communicationReady = false;
  let createCount = 0;
  let readyA = false;
  let readyB = false;
  const members = () => [
    {
      joinedAt: '2026-07-14T08:00:00.000Z',
      leftAt: null,
      playerId: ids.playerA,
      role: 'owner',
      state: 'active',
    },
    ...(accepted
      ? [
          {
            joinedAt: '2026-07-14T08:01:00.000Z',
            leftAt: null,
            playerId: ids.playerB,
            role: 'member',
            state: 'active',
          },
        ]
      : []),
  ];
  const snapshot = () => ({
    cancellationReason: null,
    cancelledAt: null,
    capacity: 2,
    communication: {
      conversationId: communicationReady
        ? '61000000-0000-4000-8000-000000000101'
        : null,
      membershipVersion: communicationReady ? membershipVersion : 0,
      status: communicationReady ? 'ready' : 'pending',
    },
    completedAt: state === 'completed' ? '2026-07-14T09:00:00.000Z' : null,
    completionClaims: [],
    createdAt: '2026-07-14T08:00:00.000Z',
    members: members(),
    membershipVersion,
    ownerPlayerId: ids.playerA,
    readyCheck:
      state === 'ready_check' || state === 'scheduled'
        ? {
            checkId: ids.check,
            deadlineAt: '2026-07-14T08:30:00.000Z',
            openedAt: '2026-07-14T08:10:00.000Z',
            requiredPlayerIds: [ids.playerA, ids.playerB],
            responses: [
              ...(readyA
                ? [
                    {
                      playerId: ids.playerA,
                      respondedAt: '2026-07-14T08:11:00.000Z',
                      response: 'ready',
                    },
                  ]
                : []),
              ...(readyB
                ? [
                    {
                      playerId: ids.playerB,
                      respondedAt: '2026-07-14T08:12:00.000Z',
                      response: 'ready',
                    },
                  ]
                : []),
            ],
            state: state === 'scheduled' ? 'passed' : 'open',
          }
        : null,
    roleAssignments: [],
    scheduledFor: null,
    sessionId: ids.session,
    source: { kind: 'manual' },
    startedAt: ['in_progress', 'completion_pending', 'completed'].includes(
      state,
    )
      ? '2026-07-14T08:20:00.000Z'
      : null,
    state,
    timezone: 'Asia/Bangkok',
    title: 'Party Session E2E',
    updatedAt: '2026-07-14T08:00:00.000Z',
    version,
  });
  const receipt = (commandName, resultCode, repeated = false) => ({
    aggregateId: ids.session,
    aggregateType: 'play_session',
    aggregateVersion: version,
    commandName,
    correlationId: '81000000-0000-4000-8000-000000000101',
    eventIds: ['82000000-0000-4000-8000-000000000101'],
    occurredAt: '2026-07-14T08:00:00.000Z',
    repeated,
    resultCode,
    session: snapshot(),
  });

  return jest.fn(async (url, init) => {
    const rpc = String(url).split('/rpc/')[1];
    const token = init.headers.Authorization.split(' ').at(-1);
    const body = JSON.parse(init.body);
    if (rpc === 'get_authenticated_player_v1') {
      const isA = token === 'token-a';
      const accountId = isA ? ids.accountA : ids.accountB;
      const playerId = isA ? ids.playerA : ids.playerB;
      return response({
        lifecycle: {
          playerId,
          profileId: accountId,
          state: 'active',
          version: 1,
        },
        principal: { accountId, playerId },
      });
    }
    if (rpc === 'create_play_session_v2') {
      createCount += 1;
      return response(
        receipt('create_play_session_v2', 'created', createCount > 1),
      );
    }
    if (rpc === 'list_my_session_invites_v2') {
      return response(
        accepted
          ? []
          : [
              {
                createdAt: '2026-07-14T08:00:00.000Z',
                expiresAt: null,
                inviteId: ids.invite,
                inviterPlayerId: ids.playerA,
                session: snapshot(),
                sessionId: ids.session,
                state: 'pending',
                targetPlayerId: ids.playerB,
                version: 1,
              },
            ],
      );
    }
    if (rpc === 'accept_session_invite_v2') {
      accepted = true;
      communicationReady = true;
      membershipVersion = 2;
      version = 2;
      return response(receipt('accept_session_invite_v2', 'invite_accepted'));
    }
    if (rpc === 'get_play_session_v2') return response(snapshot());
    if (rpc === 'open_ready_check_v2') {
      state = 'ready_check';
      version = 3;
      return response(receipt('open_ready_check_v2', 'ready_check_opened'));
    }
    if (rpc === 'respond_ready_check_v2') {
      if (body.p_expected_version !== version) {
        return authorityError(
          'version_conflict',
          'The Session version changed.',
        );
      }
      version += 1;
      if (token === 'token-a') {
        readyA = true;
        return response(receipt('respond_ready_check_v2', 'member_ready'));
      }
      readyB = true;
      state = 'scheduled';
      return response(receipt('respond_ready_check_v2', 'ready_check_passed'));
    }
    if (rpc === 'start_session_v2') {
      state = 'in_progress';
      version += 1;
      return response(receipt('start_session_v2', 'started'));
    }
    if (rpc === 'propose_session_completion_v2') {
      version += 1;
      if (token === 'token-a') {
        state = 'completion_pending';
        return response(
          receipt('propose_session_completion_v2', 'completion_pending'),
        );
      }
      state = 'completed';
      return response(receipt('propose_session_completion_v2', 'completed'));
    }
    throw new Error(`Unexpected RPC ${rpc}`);
  });
}

describe('Party/Session API V2 E2E harness', () => {
  it('runs two REST clients through replay, stale retry and completion quorum', async () => {
    let uuidSequence = 0;
    const fetchImpl = scenarioFetch();
    const result = await runPartySessionApiE2e({
      accessTokenA: 'token-a',
      accessTokenB: 'token-b',
      apiKey: 'anon-key',
      baseUrl: 'https://example.supabase.co',
      fetchImpl,
      now: () => new Date('2026-07-14T08:00:00.000Z'),
      pollAttempts: 2,
      pollIntervalMs: 0,
      runId: () => 'e1000000-0000-4000-8000-000000000101',
      sleep: async () => undefined,
      uuid: () =>
        `e2000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}`,
    });

    expect(result).toMatchObject({
      sessionId: ids.session,
      status: 'passed',
      report: {
        communicationStatus: 'ready',
        membershipVersion: 2,
        participantPlayerIds: [ids.playerA, ids.playerB],
        staleVersionRejected: true,
      },
    });
    const calls = fetchImpl.mock.calls.map(
      ([url]) => String(url).split('/rpc/')[1],
    );
    expect(
      calls.filter((rpc) => rpc === 'create_play_session_v2'),
    ).toHaveLength(2);
    expect(
      calls.filter((rpc) => rpc === 'respond_ready_check_v2'),
    ).toHaveLength(3);
    expect(calls.at(-1)).toBe('get_play_session_v2');
  });
});
