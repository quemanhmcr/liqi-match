import { describe, expect, it } from '@jest/globals';

import type {
  MessageConversationDetail,
  MessageConversationSummary,
} from '../contracts/messages-contracts';
import {
  createSimulationMessagesAdapter,
  SIMULATION_MESSAGE_OPERATIONS,
  successfulMessageMutation,
} from '../services/simulation-messages-adapter';
import type { SendChatTextCommand } from '../services/chat-message-transport';
import { createSimulationRuntime } from '@/shared/simulation';

type TestWorld = {
  sent: {
    acceptedAt: string;
    clientMessageId: string;
    conversationId: string;
    text: string;
  }[];
};

const command: SendChatTextCommand = {
  clientCreatedAt: '2026-07-13T09:00:00.000Z',
  clientMessageId: 'client-message-1',
  conversationId: 'conversation-1',
  text: 'Xin chào',
};

function createHarness(namespace: string) {
  const runtime = createSimulationRuntime<TestWorld>({
    initialScenarioId: 'golden',
    namespace,
    scenarios: [
      {
        clock: { at: '2026-07-13T09:30:00.000Z' },
        id: 'golden',
        world: { sent: [] },
      },
    ],
  });
  const adapter = createSimulationMessagesAdapter({
    mutations: {
      sendMedia: (_world, mediaCommand, context) =>
        successfulMessageMutation({
          acceptedAt: context.clock.now().toISOString(),
          canonicalMessageId: `message:${mediaCommand.clientMessageId}`,
          clientMessageId: mediaCommand.clientMessageId,
        }),
      sendText: (world, textCommand, context) => {
        if (
          !world.sent.some(
            (item) => item.clientMessageId === textCommand.clientMessageId,
          )
        ) {
          world.sent.push({
            acceptedAt: context.clock.now().toISOString(),
            clientMessageId: textCommand.clientMessageId,
            conversationId: textCommand.conversationId,
            text: textCommand.text,
          });
        }
        return successfulMessageMutation({
          acceptedAt: context.clock.now().toISOString(),
          canonicalMessageId: `message:${textCommand.clientMessageId}`,
          clientMessageId: textCommand.clientMessageId,
        });
      },
    },
    projection: {
      getConversation: () => detail(),
      getMessagePage: (world) => ({
        items: world.sent.map((message) => ({
          createdAt: message.acceptedAt,
          deliveryStatus: 'sent' as const,
          direction: 'outgoing' as const,
          id: `message:${message.clientMessageId}`,
          kind: 'text' as const,
          text: message.text,
        })),
        pageInfo: { hasNextPage: false, nextCursor: null },
      }),
      listConversations: () => ({
        items: [summary()],
        pageInfo: { hasNextPage: false, nextCursor: null },
        totalCount: 1,
        unreadConversationCount: 0,
      }),
    },
    runtime,
  });
  return { adapter, runtime };
}

describe('SimulationMessagesAdapter', () => {
  it('queues offline, flushes FIFO on reconnect and deduplicates resend', async () => {
    const { adapter, runtime } = createHarness('messages-offline');
    runtime.setNetwork('offline');

    await expect(adapter.transport.sendText(command)).rejects.toMatchObject({
      code: 'offline',
      retryable: true,
    });
    expect(adapter.listOutbox()).toEqual([
      expect.objectContaining({ status: 'queued', attempts: 1 }),
    ]);

    runtime.setNetwork('online');
    await adapter.whenIdle();

    expect(runtime.readWorld().sent).toHaveLength(1);
    expect(adapter.listOutbox()).toEqual([]);
    await expect(adapter.transport.sendText(command)).resolves.toMatchObject({
      canonicalMessageId: 'message:client-message-1',
    });
    expect(runtime.readWorld().sent).toHaveLength(1);

    await expect(
      adapter.transport.sendText({ ...command, text: 'Payload khác' }),
    ).rejects.toMatchObject({ code: 'rejected', retryable: false });
    adapter.dispose();
  });

  it('retains retryable failures and retries the same command explicitly', async () => {
    const { adapter, runtime } = createHarness('messages-retry');
    runtime.failNext({
      kind: 'retryable_server_error',
      operation: SIMULATION_MESSAGE_OPERATIONS.sendText,
      status: 503,
    });

    await expect(adapter.transport.sendText(command)).rejects.toMatchObject({
      code: 'unknown',
      retryable: true,
    });
    expect(adapter.listOutbox()).toEqual([
      expect.objectContaining({
        attempts: 1,
        status: 'failed',
        lastFailure: expect.objectContaining({ retryable: true }),
      }),
    ]);

    await expect(adapter.retry(command.clientMessageId)).resolves.toMatchObject(
      {
        clientMessageId: command.clientMessageId,
      },
    );
    expect(runtime.readWorld().sent).toHaveLength(1);
    expect(adapter.listOutbox()).toEqual([]);
    adapter.dispose();
  });

  it('maps stale cursor faults and uses the deterministic clock for metadata', async () => {
    const { adapter, runtime } = createHarness('messages-query');
    const inbox = await adapter.listConversations();

    expect(inbox.meta.generatedAt).toBe('2026-07-13T09:30:00.000Z');
    expect(inbox.meta.requestId).toBe('messages-query:messages:1');

    runtime.failNext({
      kind: 'stale_cursor',
      operation: SIMULATION_MESSAGE_OPERATIONS.timeline,
      scope: 'conversation-1',
    });
    await expect(
      adapter.getMessagePage('conversation-1', { cursor: 'old-cursor' }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'stale_cursor',
        retryable: true,
      }),
    );
    adapter.dispose();
  });

  it('restores its offline outbox with the runtime snapshot', async () => {
    const { adapter, runtime } = createHarness('messages-snapshot');
    runtime.setNetwork('offline');
    await adapter.transport.sendText(command).catch(() => undefined);
    const snapshot = await runtime.snapshot();

    await runtime.reset();
    expect(adapter.listOutbox()).toEqual([]);

    await runtime.restore(snapshot);
    expect(adapter.listOutbox()).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    runtime.setNetwork('online');
    await adapter.whenIdle();
    expect(runtime.readWorld().sent).toHaveLength(1);
    adapter.dispose();
  });
});

function summary(): MessageConversationSummary {
  return {
    capabilities: {
      canCall: true,
      canMessage: true,
      canMute: true,
      canViewDetails: true,
      composerActions: [],
    },
    id: 'conversation-1',
    kind: 'direct',
    latestActivity: null,
    participants: {
      preview: [
        {
          displayName: 'Minh Anh',
          id: 'profile-minh-anh',
          role: 'member',
        },
      ],
      totalCount: 2,
    },
    presence: { label: 'Đang online', state: 'online' },
    relationship: 'friend',
    title: 'Minh Anh',
    viewerState: {
      isArchived: false,
      isMuted: false,
      isPinned: false,
      unreadCount: 0,
    },
  };
}

function detail(): MessageConversationDetail {
  return {
    ...summary(),
    composer: { placeholder: 'Nhắn tin...' },
    liveState: { typingParticipantIds: [] },
    members: [
      {
        displayName: 'Current User',
        id: 'viewer',
        role: 'member',
      },
      {
        displayName: 'Minh Anh',
        id: 'profile-minh-anh',
        role: 'member',
      },
    ],
    subtitle: 'Bạn bè',
  };
}
