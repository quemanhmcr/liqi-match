import type { CoreV2ErrorCode } from '@/shared/contracts/core-v2';

export class PlaySessionDomainError extends Error {
  constructor(
    readonly code: CoreV2ErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'PlaySessionDomainError';
  }
}
