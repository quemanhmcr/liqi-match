import { describe, expect, it } from '@jest/globals';

import { parsePublicEnv } from '@/shared/config/env';

describe('parsePublicEnv', () => {
  it('returns an immutable config when public env values are valid', () => {
    const parsed = parsePublicEnv({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
    });

    expect(parsed).toEqual({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('reports the invalid variable name', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_API_URL: 'not-a-url',
        EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
      }),
    ).toThrow('EXPO_PUBLIC_API_URL');
  });
});
