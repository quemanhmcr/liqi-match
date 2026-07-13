/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

/**
 * Canonical conversation projection for an authenticated participant.
 */
export interface ConversationSnapshotV1 {
  /**
   * ConversationId.
   */
  conversationId: string;
  /**
   * Authoritative MatchId.
   */
  matchId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  participantIds: [string, string];
  state: 'open' | 'archived' | 'closed';
  lastMessage: null | {
    /**
     * MessageId.
     */
    messageId: string;
    /**
     * PlayerId.
     */
    senderPlayerId: string;
    sequence: number;
    kind: 'text' | 'media' | 'system';
    preview: string;
    /**
     * Authoritative server creation time.
     */
    createdAt: string;
  };
  unreadCount: number;
  version: number;
}
