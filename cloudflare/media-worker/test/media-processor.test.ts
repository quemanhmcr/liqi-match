import { describe, expect, it } from 'vitest';

import { detectImageMime } from '../src/media-processor';

describe('detectImageMime', () => {
  it('detects jpeg from the file header without requiring end-of-image bytes', () => {
    expect(
      detectImageMime(
        new Uint8Array([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
          0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
        ]),
      ),
    ).toBe('image/jpeg');
  });

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
