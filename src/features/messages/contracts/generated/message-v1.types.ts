/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

/**
 * Canonical immutable message event payload.
 */
export interface MessageV1 {
  /**
   * MessageId.
   */
  messageId: string;
  /**
   * ConversationId.
   */
  conversationId: string;
  /**
   * PlayerId.
   */
  senderPlayerId: string;
  /**
   * Client-generated idempotency identifier scoped to sender and conversation.
   */
  clientMessageId: string;
  sequence: number;
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
      }
    | {
        kind: 'system';
        eventType: string;
      };
  /**
   * Authoritative server creation time.
   */
  createdAt: string;
}
