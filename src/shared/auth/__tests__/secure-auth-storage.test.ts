import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';

import {
  ChunkedSecureAuthStorage,
  splitByUtf8ByteLength,
  type SecureAuthStorageBackend,
  type SecureAuthStorageEvent,
} from '@/shared/auth/secure-auth-storage-core';

class FakeBackend implements SecureAuthStorageBackend {
  readonly values = new Map<string, string>();
  failNextSet: ((key: string) => boolean) | null = null;
  failNextRemove: ((key: string) => boolean) | null = null;
  ignoreDeletes = false;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failNextSet?.(key)) {
      this.failNextSet = null;
      throw new Error('simulated write interruption');
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (this.failNextRemove?.(key)) {
      this.failNextRemove = null;
      throw new Error('simulated delete interruption');
    }
    if (!this.ignoreDeletes) this.values.delete(key);
  }
}

const digest = async (value: string) =>
  createHash('sha256').update(value).digest('hex');

function createStorage(
  backend: FakeBackend,
  events: SecureAuthStorageEvent[] = [],
) {
  return new ChunkedSecureAuthStorage({
    backend,
    digest,
    chunkByteLimit: 8,
    maximumValueBytes: 512,
    telemetry(event) {
      events.push(event);
    },
  });
}

describe('ChunkedSecureAuthStorage', () => {
  it('splits by UTF-8 bytes without breaking Unicode code points', () => {
    const chunks = splitByUtf8ByteLength('ab😀cđ', 5);

    expect(chunks).toEqual(['ab', '😀c', 'đ']);
    expect(chunks.join('')).toBe('ab😀cđ');
  });

  it('round-trips a session larger than one SecureStore chunk', async () => {
    const backend = new FakeBackend();
    const storage = createStorage(backend);
    const session = JSON.stringify({
      access_token: 'access-token-value',
      refresh_token: 'refresh-token-value',
      user: { id: 'account-1', name: 'Người chơi 😀' },
    });

    await storage.setItem('sb-project-auth-token', session);

    expect(await storage.getItem('sb-project-auth-token')).toBe(session);
    expect(
      [...backend.values.keys()].every((key) => !key.includes('project')),
    ).toBe(true);
    expect(
      [...backend.values.keys()].filter((key) => key.includes('.c')).length,
    ).toBeGreaterThan(1);
  });

  it('keeps the previous committed session when a new slot write is interrupted', async () => {
    const backend = new FakeBackend();
    const storage = createStorage(backend);
    await storage.setItem('session', 'previous-session');
    backend.failNextSet = (key) => key.endsWith('.b.c1');

    await expect(
      storage.setItem('session', 'replacement-session'),
    ).rejects.toThrow('simulated write interruption');

    expect(await storage.getItem('session')).toBe('previous-session');
  });

  it('recovers the prior valid slot when the active slot is corrupted', async () => {
    const backend = new FakeBackend();
    const events: SecureAuthStorageEvent[] = [];
    const storage = createStorage(backend, events);
    await storage.setItem('session', 'previous-session');
    backend.ignoreDeletes = true;
    await storage.setItem('session', 'current-session');
    backend.ignoreDeletes = false;
    const activeChunk = [...backend.values.keys()].find((key) =>
      key.endsWith('.b.c0'),
    );
    expect(activeChunk).toBeDefined();
    backend.values.set(activeChunk!, 'corrupted');

    expect(await storage.getItem('session')).toBe('previous-session');
    expect(events).toContain('fallback_recovered');
  });

  it('clears corrupted storage when no valid fallback exists', async () => {
    const backend = new FakeBackend();
    const events: SecureAuthStorageEvent[] = [];
    const storage = createStorage(backend, events);
    await storage.setItem('session', 'current-session');
    const activeChunk = [...backend.values.keys()].find((key) =>
      key.endsWith('.a.c0'),
    );
    backend.values.set(activeChunk!, 'corrupted');

    expect(await storage.getItem('session')).toBeNull();
    expect(events).toContain('corruption_detected');
    expect(backend.values.size).toBe(0);
  });

  it('serializes concurrent writes for the same logical key', async () => {
    const backend = new FakeBackend();
    const storage = createStorage(backend);

    await Promise.all([
      storage.setItem('session', 'first-session'),
      storage.setItem('session', 'second-session'),
    ]);

    expect(await storage.getItem('session')).toBe('second-session');
  });

  it('removes the restore pointer even when orphan chunk cleanup fails', async () => {
    const backend = new FakeBackend();
    const events: SecureAuthStorageEvent[] = [];
    const storage = createStorage(backend, events);
    await storage.setItem('session', 'current-session');
    backend.failNextRemove = (key) => key.endsWith('.a.c0');

    await storage.removeItem('session');

    expect(await storage.getItem('session')).toBeNull();
    expect(events).toContain('cleanup_failed');
    expect(
      [...backend.values.keys()].some((key) => key.endsWith('.active')),
    ).toBe(false);
  });

  it('removes all secure slot data on sign-out', async () => {
    const backend = new FakeBackend();
    const storage = createStorage(backend);
    await storage.setItem('session', 'current-session');

    await storage.removeItem('session');

    expect(await storage.getItem('session')).toBeNull();
    expect(backend.values.size).toBe(0);
  });

  it('rejects unexpectedly large session payloads', async () => {
    const backend = new FakeBackend();
    const storage = new ChunkedSecureAuthStorage({
      backend,
      digest,
      chunkByteLimit: 8,
      maximumValueBytes: 128,
    });

    await expect(storage.setItem('session', 'x'.repeat(129))).rejects.toThrow(
      'exceeds 128 UTF-8 bytes',
    );
  });
});
