import { describe, expect, it } from '@jest/globals';

import {
  ChatTransportError,
  createChatScenarioController,
  createSendChatMediaCommand,
  createSendChatTextCommand,
  normalizeChatText,
  previewChatMessageTransport,
} from '@/features/messages/services/chat-message-transport';

describe('chat message transport contract', () => {
  it('normalizes outer whitespace while preserving line breaks', () => {
    expect(normalizeChatText('  Dòng một\r\nDòng hai  ')).toBe(
      'Dòng một\nDòng hai',
    );
  });

  it('creates a backend-agnostic send command', () => {
    expect(
      createSendChatTextCommand({
        clientCreatedAt: '2026-07-11T12:30:00.000Z',
        clientMessageId: 'client-message-1',
        conversationId: 'conversation-any-shape',
        text: '  Xin chào  ',
      }),
    ).toEqual({
      clientCreatedAt: '2026-07-11T12:30:00.000Z',
      clientMessageId: 'client-message-1',
      conversationId: 'conversation-any-shape',
      text: 'Xin chào',
    });
  });

  it('rejects empty text before the transport boundary', () => {
    expect(() =>
      createSendChatTextCommand({
        clientCreatedAt: '2026-07-11T12:30:00.000Z',
        clientMessageId: 'client-message-1',
        conversationId: 'conversation-1',
        text: ' \n ',
      }),
    ).toThrow(ChatTransportError);
  });

  it('provides a preview adapter with no backend assumptions', async () => {
    const command = createSendChatTextCommand({
      clientCreatedAt: '2026-07-11T12:30:00.000Z',
      clientMessageId: 'client-message-1',
      conversationId: 'conversation-1',
      text: 'Xin chào',
    });

    await expect(
      previewChatMessageTransport.sendText(command),
    ).resolves.toEqual({
      acceptedAt: command.clientCreatedAt,
      canonicalMessageId: command.clientMessageId,
      clientMessageId: command.clientMessageId,
    });
  });

  it('creates a backend-agnostic media command', async () => {
    const command = createSendChatMediaCommand({
      caption: '  Ảnh lobby  ',
      clientCreatedAt: '2026-07-11T12:30:00.000Z',
      clientMessageId: 'client-media-1',
      conversationId: 'conversation-1',
      media: {
        fileName: 'lobby.jpg',
        mediaType: 'image',
        uri: 'file:///lobby.jpg',
      },
    });

    expect(command.caption).toBe('Ảnh lobby');
    await expect(
      previewChatMessageTransport.sendMedia?.(command),
    ).resolves.toEqual({
      acceptedAt: command.clientCreatedAt,
      canonicalMessageId: command.clientMessageId,
      clientMessageId: command.clientMessageId,
    });
  });

  it('reports offline deterministically and notifies network subscribers', async () => {
    const scenario = createChatScenarioController({ network: 'offline' });
    const states: string[] = [];
    const subscription = scenario.transport.subscribeNetworkState?.((state) =>
      states.push(state),
    );
    const command = createSendChatTextCommand({
      clientCreatedAt: '2026-07-11T12:30:00.000Z',
      clientMessageId: 'offline-message',
      conversationId: 'conversation-1',
      text: 'Gửi sau',
    });

    await expect(scenario.transport.sendText(command)).rejects.toMatchObject({
      code: 'offline',
      retryable: true,
    });
    scenario.setNetworkState('online');
    expect(states).toEqual(['online']);
    subscription?.remove();
    scenario.setNetworkState('offline');
    expect(states).toEqual(['online']);
  });

  it('fails only the next configured send and then recovers', async () => {
    const scenario = createChatScenarioController();
    scenario.failNextText('rate-limited');
    const command = createSendChatTextCommand({
      clientCreatedAt: '2026-07-11T12:30:00.000Z',
      clientMessageId: 'scenario-message',
      conversationId: 'conversation-1',
      text: 'Xin chào',
    });

    await expect(scenario.transport.sendText(command)).rejects.toMatchObject({
      code: 'rate-limited',
    });
    await expect(scenario.transport.sendText(command)).resolves.toMatchObject({
      clientMessageId: command.clientMessageId,
    });
  });
});
