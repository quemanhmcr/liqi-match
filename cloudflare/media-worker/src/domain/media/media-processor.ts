export type MediaValidationResult = {
  ok: boolean;
  detectedMimeType?: string;
  error?: string;
};

export interface MediaProcessor {
  validateMagicBytes(
    bytes: Uint8Array,
    expectedMimeType: string,
  ): MediaValidationResult;
}

export class BasicImageMediaProcessor implements MediaProcessor {
  validateMagicBytes(
    bytes: Uint8Array,
    expectedMimeType: string,
  ): MediaValidationResult {
    const detectedMimeType = detectImageMime(bytes);
    if (!detectedMimeType)
      return { ok: false, error: 'unsupported_magic_bytes' };
    if (detectedMimeType !== expectedMimeType) {
      return { ok: false, detectedMimeType, error: 'mime_mismatch' };
    }
    return { ok: true, detectedMimeType };
  }
}

export function detectImageMime(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}
