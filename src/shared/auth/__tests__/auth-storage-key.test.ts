import { describe, expect, it } from '@jest/globals';

import {
  createAuthStorageKey,
  LEGACY_AUTH_STORAGE_KEY,
} from '../auth-storage-key';

describe('Supabase auth storage key', () => {
  it('isolates development sessions by Supabase project ref', () => {
    expect(
      createAuthStorageKey('https://ibprkyemsuktfrdpxvza.supabase.co', true),
    ).toBe(`${LEGACY_AUTH_STORAGE_KEY}.ibprkyemsuktfrdpxvza`);
    expect(
      createAuthStorageKey('https://wngumhizuxtlhavbpxzy.supabase.co', true),
    ).not.toBe(`${LEGACY_AUTH_STORAGE_KEY}.ibprkyemsuktfrdpxvza`);
  });

  it('keeps the production key backward-compatible', () => {
    expect(
      createAuthStorageKey('https://ibprkyemsuktfrdpxvza.supabase.co', false),
    ).toBe(LEGACY_AUTH_STORAGE_KEY);
  });

  it('supports local and custom-domain development endpoints safely', () => {
    expect(createAuthStorageKey('http://127.0.0.1:54321', true)).toBe(
      `${LEGACY_AUTH_STORAGE_KEY}.127.0.0.1`,
    );
    expect(createAuthStorageKey('https://auth.review.example', true)).toBe(
      `${LEGACY_AUTH_STORAGE_KEY}.auth.review.example`,
    );
  });
});
