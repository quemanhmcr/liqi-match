const { randomUUID } = require('node:crypto');
const {
  E2E_DISPOSABLE_PROJECT,
  assertUrlProjectTarget,
} = require('../supabase/project-registry.cjs');

class ReturnLoopE2eError extends Error {}

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
      if (!response.ok) {
        throw new ReturnLoopE2eError(
          `${name} failed (${response.status}): ${text.slice(0, 500)}`,
        );
      }
      return text ? JSON.parse(text) : null;
    },
  };
}

async function runReturnLoopApiE2e(input) {
  const startedAt = input.now().toISOString();
  const runId = input.runId();
  const uuid = input.uuid ?? randomUUID;
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
  const operator = createRestClient({
    apiKey: input.serviceRoleKey,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    token: input.serviceRoleKey,
  });

  let report;
  try {
    const [contextA, contextB] = await Promise.all([
      deviceA.rpc('get_authenticated_player_v1'),
      deviceB.rpc('get_authenticated_player_v1'),
    ]);
    const identityA = authenticatedIdentity(contextA, 'A');
    const identityB = authenticatedIdentity(contextB, 'B');
    assertDifferent(identityA.accountId, identityB.accountId, 'AccountId');
    assertDifferent(identityA.playerId, identityB.playerId, 'PlayerId');
    assertDifferent(identityA.profileId, identityB.profileId, 'ProfileId');
    if (
      input.expectedRecipientPlayerId &&
      identityB.playerId !== input.expectedRecipientPlayerId
    ) {
      throw new ReturnLoopE2eError(
        'Recipient PlayerId does not match device B.',
      );
    }

    const homeBeforeMessage = await pollUntil(
      'canonical Match-to-Conversation readiness',
      () => deviceB.rpc('get_home_dashboard_v1'),
      (home) => hasHomeCoreLoop(home, input),
      input,
    );
    const inboxBeforeMessage = await deviceB.rpc('list_notifications_v1', {
      p_cursor: null,
      p_limit: 100,
    });
    assertHomeCoreLoop(homeBeforeMessage, input);
    const baselineNotificationIds = new Set(
      (inboxBeforeMessage?.items ?? []).map((item) => item.notificationId),
    );

    const sendCommand = {
      p_client_created_at: startedAt,
      p_client_message_id: `e2e-message:${runId}`,
      p_content: {
        kind: 'text',
        text: input.messageText ?? 'Production Match Loop E2E message',
      },
      p_conversation_id: input.expectedConversationId,
      p_correlation_id: uuid(),
    };
    const firstSend = await deviceA.rpc('send_message_v1', sendCommand);
    assertMessageSend(firstSend, {
      conversationId: input.expectedConversationId,
      repeated: false,
      senderPlayerId: identityA.playerId,
    });
    const retrySend = await deviceA.rpc('send_message_v1', sendCommand);
    assertMessageSend(retrySend, {
      conversationId: input.expectedConversationId,
      repeated: true,
      senderPlayerId: identityA.playerId,
    });
    if (
      retrySend.message.messageId !== firstSend.message.messageId ||
      retrySend.message.sequence !== firstSend.message.sequence
    ) {
      throw new ReturnLoopE2eError(
        'Message retry did not return the original MessageId and sequence.',
      );
    }

    const timelineAfterSend = await deviceB.rpc(
      'get_conversation_timeline_v1',
      {
        p_after_sequence: null,
        p_before_sequence: null,
        p_conversation_id: input.expectedConversationId,
        p_limit: 100,
      },
    );
    assertTimelineContainsExactlyOnce(
      timelineAfterSend,
      firstSend.message.messageId,
    );

    const homeWithUnread = await pollUntil(
      'Home unread projection after message',
      () => deviceB.rpc('get_home_dashboard_v1'),
      (home) =>
        homeConversation(home, input.expectedConversationId)?.unreadCount >= 1,
      input,
    );
    assertHomeCoreLoop(homeWithUnread, input);

    const notificationPage = await pollUntil(
      'persisted message notification',
      () =>
        deviceB.rpc('list_notifications_v1', {
          p_cursor: null,
          p_limit: 100,
        }),
      (page) =>
        newMessageNotifications(
          page,
          baselineNotificationIds,
          input.expectedConversationId,
          identityB.playerId,
        ).length >= 1,
      input,
    );
    const matchingNotifications = newMessageNotifications(
      notificationPage,
      baselineNotificationIds,
      input.expectedConversationId,
      identityB.playerId,
    );
    if (matchingNotifications.length !== 1) {
      throw new ReturnLoopE2eError(
        `Expected exactly one new message notification; got ${matchingNotifications.length}.`,
      );
    }
    const notification = matchingNotifications[0];
    assertOptionalExpectedId(
      notification.notificationId,
      input.expectedNotificationId,
      'NotificationId',
    );
    assertOptionalExpectedId(
      notification.sourceEventId,
      input.expectedSourceEventId,
      'source EventId',
    );

    const firstResolution = await deviceB.rpc(
      'resolve_notification_deep_link_v1',
      {
        p_notification_id: notification.notificationId,
        p_source_event_id: notification.sourceEventId,
      },
    );
    assertConversationResolution(firstResolution, input.expectedConversationId);

    const readCommand = {
      p_conversation_id: input.expectedConversationId,
      p_correlation_id: uuid(),
      p_last_read_sequence: firstSend.message.sequence,
    };
    const firstRead = await deviceB.rpc(
      'advance_conversation_read_v1',
      readCommand,
    );
    assertReadAdvance(firstRead, {
      conversationId: input.expectedConversationId,
      lastReadSequence: firstSend.message.sequence,
      playerId: identityB.playerId,
      repeated: false,
    });
    const retryRead = await deviceB.rpc(
      'advance_conversation_read_v1',
      readCommand,
    );
    assertReadAdvance(retryRead, {
      conversationId: input.expectedConversationId,
      lastReadSequence: firstSend.message.sequence,
      playerId: identityB.playerId,
      repeated: true,
    });

    const homeAfterRead = await pollUntil(
      'Home unread projection after read watermark',
      () => deviceB.rpc('get_home_dashboard_v1'),
      (home) =>
        homeConversation(home, input.expectedConversationId)?.unreadCount === 0,
      input,
    );
    assertHomeCoreLoop(homeAfterRead, input);

    // A new REST client models app process restart with the same restored session.
    const restartedDeviceB = createRestClient({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      fetchImpl: input.fetchImpl,
      token: input.accessTokenB,
    });
    const [
      homeAfterRestart,
      inboxAfterRestart,
      surfaceAfterRestart,
      timelineAfterRestart,
    ] = await Promise.all([
      restartedDeviceB.rpc('get_home_dashboard_v1'),
      restartedDeviceB.rpc('list_notifications_v1', {
        p_cursor: null,
        p_limit: 100,
      }),
      restartedDeviceB.rpc('get_conversation_surface_v1', {
        p_conversation_id: input.expectedConversationId,
      }),
      restartedDeviceB.rpc('get_conversation_timeline_v1', {
        p_after_sequence: null,
        p_before_sequence: null,
        p_conversation_id: input.expectedConversationId,
        p_limit: 100,
      }),
    ]);
    assertHomeCoreLoop(homeAfterRestart, input);
    if (
      homeConversation(homeAfterRestart, input.expectedConversationId)
        ?.unreadCount !== 0
    ) {
      throw new ReturnLoopE2eError(
        'Restart did not restore the authoritative zero unread state.',
      );
    }
    const matchingAfter = (inboxAfterRestart?.items ?? []).filter(
      (item) => item.notificationId === notification.notificationId,
    );
    if (matchingAfter.length !== 1 || !matchingAfter[0].readAt) {
      throw new ReturnLoopE2eError(
        'Restart did not restore one persisted, read notification.',
      );
    }
    if (
      surfaceAfterRestart?.viewer?.playerId !== identityB.playerId ||
      surfaceAfterRestart?.viewer?.lastReadSequence < firstSend.message.sequence
    ) {
      throw new ReturnLoopE2eError(
        'Restart did not restore the authoritative Conversation read watermark.',
      );
    }
    assertTimelineContainsExactlyOnce(
      timelineAfterRestart,
      firstSend.message.messageId,
    );

    const retryResolution = await restartedDeviceB.rpc(
      'resolve_notification_deep_link_v1',
      {
        p_notification_id: notification.notificationId,
        p_source_event_id: notification.sourceEventId,
      },
    );
    assertConversationResolution(retryResolution, input.expectedConversationId);
    const retryInbox = await restartedDeviceB.rpc('list_notifications_v1', {
      p_cursor: null,
      p_limit: 100,
    });
    if (
      (retryInbox?.items ?? []).filter(
        (item) => item.sourceEventId === notification.sourceEventId,
      ).length !== 1
    ) {
      throw new ReturnLoopE2eError(
        'Retry produced a duplicate notification for the source EventId.',
      );
    }

    report = {
      canonicalIdentitySeparated: true,
      conversationId: input.expectedConversationId,
      conversationReadAdvanced: true,
      deepLinkResolved: true,
      matchId: input.expectedMatchId,
      messageId: firstSend.message.messageId,
      messageRetryIdempotent: true,
      messageSequence: firstSend.message.sequence,
      notificationId: notification.notificationId,
      notificationRetryIdempotent: true,
      pushObserved: input.pushObserved,
      readRetryIdempotent: true,
      restartRestored: true,
      sourceEventId: notification.sourceEventId,
      twoDeviceCoreLoop: true,
    };
    await recordResult(operator, {
      completedAt: input.now().toISOString(),
      report,
      runId,
      startedAt,
      status: 'passed',
    });
    return { report, runId, status: 'passed' };
  } catch (error) {
    const failureReport = {
      error: error instanceof Error ? error.message : String(error),
      pushObserved: false,
      twoDeviceCoreLoop: false,
    };
    try {
      await recordResult(operator, {
        completedAt: input.now().toISOString(),
        report: failureReport,
        runId,
        startedAt,
        status: 'failed',
      });
    } catch (recordError) {
      if (error instanceof Error) {
        error.message += `; failed to record E2E evidence: ${String(recordError)}`;
      }
    }
    throw error;
  }
}

function authenticatedIdentity(context, label) {
  const principal = context?.principal;
  const lifecycle = context?.lifecycle;
  assertSemanticId(principal?.accountId, `AccountId ${label}`);
  assertSemanticId(principal?.playerId, `PlayerId ${label}`);
  assertSemanticId(lifecycle?.profileId, `ProfileId ${label}`);
  if (lifecycle?.playerId !== principal.playerId) {
    throw new ReturnLoopE2eError(
      `Authenticated PlayerId ${label} is inconsistent with lifecycle authority.`,
    );
  }
  if (lifecycle?.state !== 'active') {
    throw new ReturnLoopE2eError(
      `Player ${label} must be active; got ${lifecycle?.state}.`,
    );
  }
  return {
    accountId: principal.accountId,
    playerId: principal.playerId,
    profileId: lifecycle.profileId,
  };
}

function hasHomeCoreLoop(home, input) {
  const match = (home?.recentMatches ?? []).find(
    (item) => item.matchId === input.expectedMatchId,
  );
  return Boolean(
    match?.conversationId === input.expectedConversationId &&
    homeConversation(home, input.expectedConversationId),
  );
}

function assertHomeCoreLoop(home, input) {
  const match = (home?.recentMatches ?? []).find(
    (item) => item.matchId === input.expectedMatchId,
  );
  if (!match) throw new ReturnLoopE2eError('Home is missing expected MatchId.');
  if (match.conversationId !== input.expectedConversationId) {
    throw new ReturnLoopE2eError(
      'Home match does not reference expected ConversationId.',
    );
  }
  const conversation = homeConversation(home, input.expectedConversationId);
  if (!conversation) {
    throw new ReturnLoopE2eError(
      'Home is missing expected ConversationId projection.',
    );
  }
  if (!Number.isInteger(conversation.unreadCount)) {
    throw new ReturnLoopE2eError(
      'Conversation unread fact is not authoritative integer data.',
    );
  }
}

function homeConversation(home, conversationId) {
  return (home?.conversations ?? []).find(
    (item) => item.conversationId === conversationId,
  );
}

function assertMessageSend(result, expected) {
  const message = result?.message;
  assertSemanticId(message?.messageId, 'MessageId');
  if (result?.repeated !== expected.repeated) {
    throw new ReturnLoopE2eError(
      `Message repeated flag mismatch; expected ${expected.repeated}.`,
    );
  }
  if (
    message.conversationId !== expected.conversationId ||
    message.senderPlayerId !== expected.senderPlayerId ||
    !Number.isInteger(message.sequence) ||
    message.sequence < 1
  ) {
    throw new ReturnLoopE2eError(
      'Message command returned inconsistent Conversation/Player/sequence facts.',
    );
  }
}

function assertTimelineContainsExactlyOnce(timeline, messageId) {
  const matches = (timeline ?? []).filter(
    (message) => message.messageId === messageId,
  );
  if (matches.length !== 1) {
    throw new ReturnLoopE2eError(
      `Expected MessageId exactly once in timeline; got ${matches.length}.`,
    );
  }
}

function assertReadAdvance(result, expected) {
  const readState = result?.readState;
  if (result?.repeated !== expected.repeated) {
    throw new ReturnLoopE2eError(
      `Read repeated flag mismatch; expected ${expected.repeated}.`,
    );
  }
  if (
    readState?.conversationId !== expected.conversationId ||
    readState?.playerId !== expected.playerId ||
    readState?.lastReadSequence !== expected.lastReadSequence ||
    readState?.unreadCount !== 0
  ) {
    throw new ReturnLoopE2eError(
      'Read command did not persist the expected authoritative watermark.',
    );
  }
}

function assertConversationResolution(resolution, expectedConversationId) {
  if (resolution?.status !== 'available') {
    throw new ReturnLoopE2eError(
      `Deep link did not resolve as available: ${resolution?.status}`,
    );
  }
  if (
    resolution.deepLink?.target !== 'conversation' ||
    resolution.deepLink.conversationId !== expectedConversationId
  ) {
    throw new ReturnLoopE2eError(
      'Deep link did not resolve to expected ConversationId.',
    );
  }
}

function newMessageNotifications(
  page,
  baselineNotificationIds,
  conversationId,
  recipientPlayerId,
) {
  return (page?.items ?? []).filter(
    (notification) =>
      !baselineNotificationIds.has(notification.notificationId) &&
      notification.kind === 'message_received' &&
      notification.recipientPlayerId === recipientPlayerId &&
      notification.deepLink?.target === 'conversation' &&
      notification.deepLink.conversationId === conversationId,
  );
}

async function pollUntil(label, operation, predicate, input) {
  const attempts = input.pollAttempts ?? 30;
  const sleep = input.sleep ?? defaultSleep;
  const delayMs = input.pollIntervalMs ?? 1_000;
  let lastValue;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      lastValue = await operation();
      if (predicate(lastValue)) return lastValue;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new ReturnLoopE2eError(
    `${label} was not observed after ${attempts} attempts${detail}.`,
  );
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function assertOptionalExpectedId(actual, expected, label) {
  assertSemanticId(actual, label);
  if (expected && actual !== expected) {
    throw new ReturnLoopE2eError(`${label} does not match scenario.`);
  }
}

async function recordResult(operator, result) {
  await operator.rpc('record_return_loop_api_e2e_result_v1', {
    p_completed_at: result.completedAt,
    p_report: result.report,
    p_run_id: result.runId,
    p_started_at: result.startedAt,
    p_status: result.status,
  });
}

function assertSemanticId(value, label) {
  if (typeof value !== 'string' || !value) {
    throw new ReturnLoopE2eError(`${label} is missing.`);
  }
}

function assertDifferent(left, right, label) {
  if (left === right) {
    throw new ReturnLoopE2eError(`${label} values must be distinct.`);
  }
}

function assertApiE2eTarget(baseUrl) {
  try {
    return assertUrlProjectTarget(baseUrl, 'e2e-disposable', 'SUPABASE_URL');
  } catch (error) {
    throw new ReturnLoopE2eError(error.message);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new ReturnLoopE2eError(`Missing environment: ${name}`);
  return value;
}

function optionalEnvironment(name) {
  return process.env[name] || undefined;
}

function environmentInput() {
  const baseUrl = requiredEnvironment('SUPABASE_URL');
  const target = assertApiE2eTarget(baseUrl);
  console.log(
    `API_E2E_TARGET target=${target.target} project_name=${target.projectName} project_ref=${target.projectRef}`,
  );
  return {
    accessTokenA: requiredEnvironment('RETURN_LOOP_E2E_ACCESS_TOKEN_A'),
    accessTokenB: requiredEnvironment('RETURN_LOOP_E2E_ACCESS_TOKEN_B'),
    apiKey: requiredEnvironment('SUPABASE_ANON_KEY'),
    baseUrl,
    expectedConversationId: requiredEnvironment(
      'RETURN_LOOP_E2E_CONVERSATION_ID',
    ),
    expectedMatchId: requiredEnvironment('RETURN_LOOP_E2E_MATCH_ID'),
    expectedNotificationId: optionalEnvironment(
      'RETURN_LOOP_E2E_NOTIFICATION_ID',
    ),
    expectedRecipientPlayerId: optionalEnvironment(
      'RETURN_LOOP_E2E_RECIPIENT_PLAYER_ID',
    ),
    expectedSourceEventId: optionalEnvironment(
      'RETURN_LOOP_E2E_SOURCE_EVENT_ID',
    ),
    fetchImpl: fetch,
    now: () => new Date(),
    pushObserved: process.env.RETURN_LOOP_E2E_PUSH_OBSERVED === 'true',
    runId: randomUUID,
    serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    uuid: randomUUID,
  };
}

if (require.main === module) {
  runReturnLoopApiE2e(environmentInput())
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  ReturnLoopE2eError,
  assertApiE2eTarget,
  createRestClient,
  runReturnLoopApiE2e,
};
