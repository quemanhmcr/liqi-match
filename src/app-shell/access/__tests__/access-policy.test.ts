import { describe, expect, it } from '@jest/globals';

import {
  resolveAccess,
  type AccessDecision,
  type AccessSnapshot,
} from '@/app-shell/access/access-policy';

describe('resolveAccess', () => {
  const cases: [AccessSnapshot, AccessDecision][] = [
    [{ area: 'public', hasSession: false }, 'allow'],
    [{ area: 'public', hasSession: true }, 'to-home'],
    [{ area: 'app', hasSession: false }, 'to-login'],
    [
      { area: 'app', hasCompletedOnboarding: false, hasSession: true },
      'to-onboarding',
    ],
    [{ area: 'app', hasCompletedOnboarding: true, hasSession: true }, 'allow'],
    [{ area: 'onboarding', hasSession: false }, 'to-login'],
    [
      { area: 'onboarding', hasCompletedOnboarding: false, hasSession: true },
      'allow',
    ],
    [
      { area: 'onboarding', hasCompletedOnboarding: true, hasSession: true },
      'to-home',
    ],
  ];

  it.each(cases)('resolves %#', (input, expected) => {
    expect(resolveAccess(input)).toBe(expected);
  });
});
