import { describe, expect, it } from 'vitest';

import { detectImageMime } from '../src/media-processor';

describe('detectImageMime', () => {
  it('detects png magic bytes', () => {
    expect(
      detectImageMime(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
  });

  it('rejects unknown bytes', () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeUndefined();
  });
});
