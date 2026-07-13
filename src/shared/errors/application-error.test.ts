import { describe, expect, it } from '@jest/globals';

import { classifyApplicationError } from './application-error';

describe('classifyApplicationError', () => {
  const cases: [unknown, string, boolean][] = [
    [{ code: 'offline', retryable: true }, 'offline', true],
    [{ code: 'network_error' }, 'offline', true],
    [{ code: 'stale_cursor', retryable: true }, 'retryable', true],
    [{ code: 'validation_failed', retryable: false }, 'non-retryable', false],
    [new Error('unknown'), 'non-retryable', false],
    [null, 'none', false],
  ];

  it.each(cases)('classifies %p as %s', (error, kind, retryable) => {
    expect(classifyApplicationError(error)).toMatchObject({ kind, retryable });
  });
});
