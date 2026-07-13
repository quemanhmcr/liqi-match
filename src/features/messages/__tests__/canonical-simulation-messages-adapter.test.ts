import { describe, expect, it } from '@jest/globals';

import {
  createProductionSimulationRuntime,
  GOLDEN_ASSET_KEYS,
  GOLDEN_CONVERSATION_IDS,
  GOLDEN_PROFILE_IDS,
  VIEWER_READY_HAPPY_PATH_SCENARIO,
} from '@/entities/simulation';
import { createCanonicalSimulationMessagesAdapter } from '../services/canonical-simulation-messages-adapter';

function harness(namespace: string) {
  const runtime = createProductionSimulationRuntime({
    initialScenarioId: VIEWER_READY_HAPPY_PATH_SCENARIO.id,
    namespace,
  });
  const adapter = createCanonicalSimulationMessagesAdapter({ runtime });
  return { adapter, runtime };
}

describe('canonical simulation Messages adapter', () => {
  it('projects conversation identities, profiles, assets and unread state from one world', async () => {
    const { adapter, runtime } = harness('canonical-messages-projection');
    const inbox = await adapter.listConversations({ limit: 20 });
    const minhAnh = inbox.data.items.find(
      (conversation) => conversation.id === GOLDEN_CONVERSATION_IDS.minhAnh,
    );

    expect(minhAnh).toBeDefined();
    expect(minhAnh?.title).toBe(
      runtime.readWorld().profiles[GOLDEN_PROFILE_IDS.minhAnh]?.canonicalProfile
        .profileBasics.displayName,
    );
    expect(minhAnh?.participants.preview[0]?.id).toBe(
      GOLDEN_PROFILE_IDS.minhAnh,
    );
    expect(minhAnh?.avatar).toMatchObject({ kind: 'fixture' });

    const timeline = await adapter.getMessagePage(
      GOLDEN_CONVERSATION_IDS.minhAnh,
      { limit: 20 },
    );
    expect(timeline.data.items.length).toBeGreaterThan(0);
    expect(
      timeline.data.items.every((message) =>
        runtime
          .readWorld()
          .conversations[GOLDEN_CONVERSATION_IDS.minhAnh]?.messageIds.includes(
            message.id as never,
          ),
      ),
    ).toBe(true);
    adapter.dispose();
  });

  it('projects team invite artwork from the canonical set for authorized members', async () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: VIEWER_READY_HAPPY_PATH_SCENARIO.id,
      namespace: 'canonical-team-invite-artwork',
    });
    const adapter = createCanonicalSimulationMessagesAdapter({
      runtime,
      viewerIdForRequest: () => GOLDEN_PROFILE_IDS.khoaJungle,
    });

    const timeline = await adapter.getMessagePage(
      GOLDEN_CONVERSATION_IDS.saoBang,
      { limit: 20 },
    );
    const teamInvite = timeline.data.items.find(
      (message) => message.kind === 'team_invite',
    );

    expect(teamInvite).toMatchObject({
      artwork: {
        assetKey: GOLDEN_ASSET_KEYS.setSaoBang,
        kind: 'fixture',
      },
      kind: 'team_invite',
    });
    adapter.dispose();
  });

  it('queues offline text and flushes it into the canonical conversation graph', async () => {
    const { adapter, runtime } = harness('canonical-messages-offline');
    runtime.setNetwork('offline');
    const command = {
      clientCreatedAt: '2026-07-13T02:00:00.000Z',
      clientMessageId: 'client-offline-one',
      conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      text: 'Tin nhắn từ runtime canonical',
    };

    await expect(adapter.transport.sendText(command)).rejects.toMatchObject({
      code: 'offline',
    });
    expect(adapter.listOutbox()).toHaveLength(1);

    runtime.setNetwork('online');
    await adapter.whenIdle();

    expect(adapter.listOutbox()).toEqual([]);
    const sent = Object.values(runtime.readWorld().messages).find(
      (message) => message.kind === 'text' && message.text === command.text,
    );
    expect(sent).toMatchObject({
      conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      deliveryStatus: 'sent',
      senderId: GOLDEN_PROFILE_IDS.quanViewer,
    });
    expect(
      runtime
        .readWorld()
        .conversations[GOLDEN_CONVERSATION_IDS.minhAnh]?.messageIds.at(-1),
    ).toBe(sent?.id);

    const detail = await adapter.getConversation(
      GOLDEN_CONVERSATION_IDS.minhAnh,
    );
    expect(detail?.data.latestActivity?.preview).toBe(command.text);
    expect(detail?.data.latestActivity?.direction).toBe('outgoing');
    adapter.dispose();
  });

  it('creates a canonical media asset owned by the sent message and resets both', async () => {
    const { adapter, runtime } = harness('canonical-messages-media');
    const baselineMessageCount = Object.keys(
      runtime.readWorld().messages,
    ).length;
    const baselineAssetCount = Object.keys(runtime.readWorld().assets).length;

    const receipt = await adapter.transport.sendMedia?.({
      caption: 'Combat cuối trận',
      clientCreatedAt: '2026-07-13T02:00:00.000Z',
      clientMessageId: 'client-media-one',
      conversationId: GOLDEN_CONVERSATION_IDS.khoaJungle,
      media: {
        altText: 'Ảnh combat mô phỏng',
        fileName: 'combat.webp',
        fileSize: 1_024,
        height: 720,
        mediaType: 'image',
        uri: 'file:///simulation/combat.webp',
        width: 1280,
      },
    });

    const world = runtime.readWorld();
    const message = world.messages[receipt!.canonicalMessageId as never];
    expect(message).toMatchObject({
      kind: 'media',
      senderId: GOLDEN_PROFILE_IDS.quanViewer,
    });
    if (message?.kind !== 'media') return;
    expect(world.assets[message.assetKey]).toMatchObject({
      height: 720,
      key: message.assetKey,
      kind: 'message-image',
      owner: { id: message.id, kind: 'message' },
      state: 'available',
      width: 1280,
    });

    await runtime.reset();
    expect(Object.keys(runtime.readWorld().messages)).toHaveLength(
      baselineMessageCount,
    );
    expect(Object.keys(runtime.readWorld().assets)).toHaveLength(
      baselineAssetCount,
    );
    expect(adapter.listOutbox()).toEqual([]);
    adapter.dispose();
  });

  it('paginates the canonical timeline without gaps under partial response faults', async () => {
    const { adapter, runtime } = harness('canonical-messages-pagination');
    runtime.failNext({
      kind: 'partial_response',
      limit: 2,
      operation: 'messages.list-timeline',
      scope: GOLDEN_CONVERSATION_IDS.minhAnh,
    });

    const first = await adapter.getMessagePage(
      GOLDEN_CONVERSATION_IDS.minhAnh,
      { limit: 5 },
    );
    expect(first.data.items).toHaveLength(2);
    expect(first.data.pageInfo.nextCursor).not.toBeNull();

    const second = await adapter.getMessagePage(
      GOLDEN_CONVERSATION_IDS.minhAnh,
      { cursor: first.data.pageInfo.nextCursor!, limit: 5 },
    );
    const ids = [...first.data.items, ...second.data.items].map(
      (message) => message.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    adapter.dispose();
  });
});
