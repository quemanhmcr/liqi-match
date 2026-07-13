/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

/**
 * Authenticated monotonic read-watermark command.
 */
export interface AdvanceReadCommandV1 {
  /**
   * ConversationId.
   */
  conversationId: string;
  lastReadSequence: number;
  /**
   * Cross-mission correlation identifier.
   */
  correlationId: string;
}
