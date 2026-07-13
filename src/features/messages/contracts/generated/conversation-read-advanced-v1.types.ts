/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

export interface ConversationReadAdvancedV1 {
  /**
   * Globally unique event identifier.
   */
  eventId: string;
  eventType: 'conversation.read_advanced.v1';
  /**
   * UTC event time.
   */
  occurredAt: string;
  /**
   * Cross-mission correlation identifier.
   */
  correlationId: string;
  /**
   * Identifier of the command or event that caused this event.
   */
  causationId?: string;
  payload: {
    readState: {
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
    };
  };
}
