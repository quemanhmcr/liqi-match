import { describe, expect, it, vi } from 'vitest';

import type { MediaEventQueue } from '../src/application/ports';
import { handleInternalProcess } from '../src/transport/http/internal-process-handler';

const requestId = 'request-id';
const url = 'https://media.example.test/internal/media/process';

function request(body: unknown, token = 'internal-token') {
  return new Request(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function queue() {
  return { send: vi.fn(async () => undefined) } satisfies MediaEventQueue;
}

describe('handleInternalProcess', () => {
  it('rejects unauthenticated requests before touching the queue', async () => {
    const events = queue();
    const response = await handleInternalProcess({
      internalToken: 'internal-token',
      queue: events,
      request: request(
        {
          type: 'media_processing_requested',
          assetId: 'asset-id',
          objectKey: 'chat/asset.jpg',
        },
        'wrong-token',
      ),
      requestId,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'authentication_required', requestId },
    });
    expect(events.send).not.toHaveBeenCalled();
  });

  it('rejects malformed processing jobs', async () => {
    const events = queue();
    const response = await handleInternalProcess({
      internalToken: 'internal-token',
      queue: events,
      request: request({ type: 'media_processing_requested', assetId: '' }),
      requestId,
    });

    expect(response.status).toBe(400);
    expect(events.send).not.toHaveBeenCalled();
  });

  it('enqueues a canonical processing message with the server request id', async () => {
    const events = queue();
    const response = await handleInternalProcess({
      internalToken: 'internal-token',
      queue: events,
      request: request({
        type: 'media_processing_requested',
        assetId: 'asset-id',
        objectKey: 'chat/asset.jpg',
      }),
      requestId,
    });

    expect(response.status).toBe(200);
    expect(events.send).toHaveBeenCalledWith({
      type: 'media_processing_requested',
      assetId: 'asset-id',
      objectKey: 'chat/asset.jpg',
      requestId,
    });
  });
});
