/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

/**
 * Authoritative per-participant read watermark and derived unread count.
 */
export interface ReadStateV1 {
  /**
   * ConversationId.
   */
  conversationId: string;
  /**
   * PlayerId.
   */
  playerId: string;
  lastReadSequence: number;
  unreadCount: number;
  /**
   * Authoritative server update time.
   */
  updatedAt: string;
}
