import { describe, expect, it } from '@jest/globals';

import { parsePublicEnv } from '@/shared/config/env';

describe('parsePublicEnv', () => {
  it('returns an immutable config when public env values are valid', () => {
    const parsed = parsePublicEnv({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
    });

    expect(parsed).toEqual({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('reports the invalid variable name', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_API_URL: 'not-a-url',
      }),
    ).toThrow('EXPO_PUBLIC_API_URL');
  });
});
