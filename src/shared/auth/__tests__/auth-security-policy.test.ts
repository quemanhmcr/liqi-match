import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const authRoot = path.join(process.cwd(), 'src/shared/auth');
const read = (name: string) =>
  fs.readFileSync(path.join(authRoot, name), 'utf8');

describe('secure auth implementation policy', () => {
  it('keeps Supabase as the single PKCE and refresh authority', () => {
    const client = read('supabase-auth-client.ts');
    const runtime = read('supabase-auth-runtime.ts');

    expect(client).toContain("flowType: 'pkce'");
    expect(client).toContain('createSecureAuthStorage()');
    expect(runtime).toContain('exchangeCodeForSession');
    expect(runtime).toContain('openAuthSessionAsync');
    expect(runtime).not.toContain('flow_type=implicit');
    expect(runtime).not.toContain('grant_type=refresh_token');
    expect(runtime).not.toContain('Linking.addEventListener');
  });

  it('never writes auth tokens to AsyncStorage', () => {
    const runtime = read('supabase-auth-runtime.ts');
    expect(runtime).not.toMatch(/AsyncStorage\.(?:setItem|mergeItem|multiSet)/);
    expect(runtime).toContain(
      'AsyncStorage.removeItem(LEGACY_ASYNC_STORAGE_KEY)',
    );
  });

  it('rejects token-bearing callbacks and cleans pending PKCE state', () => {
    const callback = read('oauth-callback.ts');
    const runtime = read('supabase-auth-runtime.ts');
    expect(callback).toContain('FORBIDDEN_TOKEN_PARAMETERS');
    expect(callback).toContain("callback.hash !== ''");
    expect(runtime).toContain('clearPendingPkceVerifier');
  });
});
