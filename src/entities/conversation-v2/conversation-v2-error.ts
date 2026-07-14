import type { CoreV2ErrorCode } from '@/shared/contracts/core-v2';

export class ConversationV2ProviderError extends Error {
  constructor(
    readonly code: CoreV2ErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'ConversationV2ProviderError';
  }
}
