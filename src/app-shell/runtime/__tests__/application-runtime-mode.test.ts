import { describe, expect, it } from '@jest/globals';

import { parseApplicationRuntimeMode } from '../application-runtime-mode';

describe('parseApplicationRuntimeMode', () => {
  it.each(['simulation', 'api'] as const)('accepts %s', (mode) => {
    expect(parseApplicationRuntimeMode(mode)).toBe(mode);
  });

  it.each([undefined, '', 'preview', 'production'])('rejects %s', (mode) => {
    expect(() => parseApplicationRuntimeMode(mode)).toThrow(
      'Expected simulation or api',
    );
  });
});
