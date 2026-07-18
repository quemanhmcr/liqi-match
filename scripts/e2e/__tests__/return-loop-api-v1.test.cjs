const { describe, expect, it } = require('@jest/globals');
const {
  assertApiE2eTarget,
  runReturnLoopApiE2e,
} = require('../return-loop-api-v1.cjs');

const ids = {
  accountA: '01000000-0000-4000-8000-000000000001',
  accountB: '01000000-0000-4000-8000-000000000002',
  playerA: '20000000-0000-4000-8000-000000000001',
  playerB: '20000000-0000-4000-8000-000000000002',
  profileA: '30000000-0000-4000-8000-000000000001',
  profileB: '30000000-0000-4000-8000-000000000002',
  match: '50000000-0000-4000-8000-000000000001',
  conversation: '60000000-0000-4000-8000-000000000001',
  message: '70000000-0000-4000-8000-000000000001',
  notificationEvent: '80000000-0000-4000-8000-000000000001',
  duplicateNotificationEvent: '80000000-0000-4000-8000-000000000002',
  notification: '90000000-0000-4000-8000-000000000001',
  duplicateNotification: '90000000-0000-4000-8000-000000000002',
  sessionA: 'a0000000-0000-4000-8000-000000000001',
  sessionB: 'a0000000-0000-4000-8000-000000000002',
  sendCorrelation: 'b0000000-0000-4000-8000-000000000001',
  readCorrelation: 'b0000000-0000-4000-8000-000000000002',
};

function response(value, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
      status,
    }),
  );
}

function authenticatedContext(accountId, playerId, profileId, sessionId) {
  return {
    lifecycle: {
      discoverable: true,
      messagingAllowed: true,
      playerId,
      profileId,
      state: 'active',
      updatedAt: '2026-07-14T08:00:00.000Z',
      version: 2,
    },
    principal: {
      accountId,
      expiresAt: '2026-07-14T09:00:00.000Z',
      issuedAt: '2026-07-14T08:00:00.000Z',
      playerId,
      sessionId,
    },
  };
}

function scenarioFetch({ duplicateNotification = false } = {}) {
  let messageSent = false;
  let notificationRead = false;
  let readAdvanced = false;
  let sendCount = 0;
  let readCount = 0;
  const message = {
    clientMessageId: 'e2e-message:e0000000-0000-4000-8000-000000000001',
    content: { kind: 'text', text: 'Production Match Loop E2E message' },
    conversationId: ids.conversation,
    createdAt: '2026-07-14T08:00:00.000Z',
    messageId: ids.message,
    senderPlayerId: ids.playerA,
    sequence: 1,
  };

  return jest.fn(async (url, init) => {
    const rpc = String(url).split('/rpc/')[1];
    const authorization = init.headers.Authorization;
    const body = JSON.parse(init.body);
    if (rpc === 'get_authenticated_player_v1') {
      return authorization.endsWith('token-a')
        ? response(
            authenticatedContext(
              ids.accountA,
              ids.playerA,
              ids.profileA,
              ids.sessionA,
            ),
          )
        : response(
            authenticatedContext(
              ids.accountB,
              ids.playerB,
              ids.profileB,
              ids.sessionB,
            ),
          );
    }
    if (rpc === 'get_home_dashboard_v1') {
      return response({
        conversations: [
          {
            conversationId: ids.conversation,
            unreadCount: messageSent && !readAdvanced ? 1 : 0,
          },
        ],
        recentMatches: [
          { conversationId: ids.conversation, matchId: ids.match },
        ],
      });
    }
    if (rpc === 'send_message_v1') {
      sendCount += 1;
      messageSent = true;
      return response({ message, repeated: sendCount > 1 });
    }
    if (rpc === 'get_conversation_timeline_v1') {
      return response(messageSent ? [message] : []);
    }
    if (rpc === 'list_notifications_v1') {
      if (!messageSent) return response({ items: [] });
      const notification = {
        deepLink: {
          conversationId: ids.conversation,
          target: 'conversation',
        },
        kind: 'message_received',
        notificationId: ids.notification,
        occurredAt: '2026-07-14T08:00:01.000Z',
        readAt: notificationRead ? '2026-07-14T08:01:00.000Z' : null,
        recipientPlayerId: ids.playerB,
        seenAt: notificationRead ? '2026-07-14T08:01:00.000Z' : null,
        sourceEventId: ids.notificationEvent,
      };
      return response({
        items: duplicateNotification
          ? [
              notification,
              {
                ...notification,
                notificationId: ids.duplicateNotification,
                sourceEventId: ids.duplicateNotificationEvent,
              },
            ]
          : [notification],
      });
    }
    if (rpc === 'resolve_notification_deep_link_v1') {
      notificationRead = true;
      return response({
        deepLink: {
          conversationId: ids.conversation,
          target: 'conversation',
        },
        status: 'available',
      });
    }
    if (rpc === 'advance_conversation_read_v1') {
      readCount += 1;
      readAdvanced = true;
      return response({
        readState: {
          conversationId: ids.conversation,
          lastReadSequence: 1,
          playerId: ids.playerB,
          unreadCount: 0,
          updatedAt: '2026-07-14T08:02:00.000Z',
        },
        repeated: readCount > 1,
      });
    }
    if (rpc === 'get_conversation_surface_v1') {
      return response({
        conversation: {
          conversationId: ids.conversation,
          lastMessage: message,
          matchId: ids.match,
          participantIds: [ids.playerA, ids.playerB],
          state: 'open',
          unreadCount: 0,
          version: 2,
        },
        participants: [],
        viewer: {
          canMessage: true,
          firstUnreadMessageId: null,
          lastReadSequence: readAdvanced ? 1 : 0,
          playerId: ids.playerB,
        },
      });
    }
    if (rpc === 'record_return_loop_api_e2e_result_v1') {
      return response({ status: body.p_status });
    }
    return response({ error: `unexpected ${rpc}` }, 404);
  });
}

function input(fetchImpl) {
  const times = [
    new Date('2026-07-14T08:00:00.000Z'),
    new Date('2026-07-14T08:05:00.000Z'),
  ];
  const uuids = [ids.sendCorrelation, ids.readCorrelation];
  return {
    accessTokenA: 'token-a',
    accessTokenB: 'token-b',
    apiKey: 'anon-key',
    baseUrl: 'https://project.supabase.co',
    expectedConversationId: ids.conversation,
    expectedMatchId: ids.match,
    expectedNotificationId: ids.notification,
    expectedRecipientPlayerId: ids.playerB,
    expectedSourceEventId: ids.notificationEvent,
    fetchImpl,
    now: () => times.shift() ?? new Date('2026-07-14T08:05:00.000Z'),
    pollAttempts: 2,
    pollIntervalMs: 0,
    pushObserved: true,
    runId: () => 'e0000000-0000-4000-8000-000000000001',
    serviceRoleKey: 'service-role-key',
    sleep: async () => undefined,
    uuid: () => uuids.shift() ?? ids.readCorrelation,
  };
}

describe('API E2E target guard', () => {
  it('accepts only the disposable E2E project URL', () => {
    expect(
      assertApiE2eTarget('https://ibprkyemsuktfrdpxvza.supabase.co').target,
    ).toBe('e2e-disposable');
    expect(() =>
      assertApiE2eTarget('https://wngumhizuxtlhavbpxzy.supabase.co'),
    ).toThrow('not e2e-disposable');
  });
});

describe('return-loop API-mode E2E runner', () => {
  it('proves send, idempotent retry, authoritative unread/read, notification, deep link and restart', async () => {
    const fetchImpl = scenarioFetch();

    await expect(runReturnLoopApiE2e(input(fetchImpl))).resolves.toMatchObject({
      report: {
        canonicalIdentitySeparated: true,
        conversationReadAdvanced: true,
        deepLinkResolved: true,
        messageId: ids.message,
        messageRetryIdempotent: true,
        notificationRetryIdempotent: true,
        pushObserved: true,
        readRetryIdempotent: true,
        restartRestored: true,
        twoDeviceCoreLoop: true,
      },
      status: 'passed',
    });
    const recorded = fetchImpl.mock.calls.find(([url]) =>
      String(url).includes('record_return_loop_api_e2e_result_v1'),
    );
    expect(JSON.parse(recorded[1].body)).toMatchObject({ p_status: 'passed' });
    const sendBodies = fetchImpl.mock.calls
      .filter(([url]) => String(url).includes('/rpc/send_message_v1'))
      .map(([, init]) => JSON.parse(init.body));
    expect(sendBodies).toHaveLength(2);
    expect(sendBodies[1]).toEqual(sendBodies[0]);
    const readBodies = fetchImpl.mock.calls
      .filter(([url]) =>
        String(url).includes('/rpc/advance_conversation_read_v1'),
      )
      .map(([, init]) => JSON.parse(init.body));
    expect(readBodies).toHaveLength(2);
    expect(readBodies[1]).toEqual(readBodies[0]);
  });

  it('records failed evidence when the message creates duplicate notifications', async () => {
    const fetchImpl = scenarioFetch({ duplicateNotification: true });

    await expect(runReturnLoopApiE2e(input(fetchImpl))).rejects.toThrow(
      'Expected exactly one new message notification',
    );
    const recordedBodies = fetchImpl.mock.calls
      .filter(([url]) =>
        String(url).includes('record_return_loop_api_e2e_result_v1'),
      )
      .map(([, init]) => JSON.parse(init.body));
    expect(recordedBodies.at(-1)).toMatchObject({ p_status: 'failed' });
  });
});
