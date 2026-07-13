/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

/**
 * Authenticated command to append one text or media message.
 */
export interface SendMessageCommandV1 {
  /**
   * ConversationId.
   */
  conversationId: string;
  /**
   * Stable idempotency identifier reused for retries.
   */
  clientMessageId: string;
  content:
    | {
        kind: 'text';
        text: string;
      }
    | {
        kind: 'media';
        /**
         * Authoritative media asset identifier.
         */
        assetId: string;
        caption?: string;
      };
  /**
   * Client observation time; never used for canonical ordering.
   */
  clientCreatedAt: string;
  /**
   * Cross-mission correlation identifier.
   */
  correlationId: string;
}
