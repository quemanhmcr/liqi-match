/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

export interface ConversationCreatedV1 {
  /**
   * Globally unique event identifier.
   */
  eventId: string;
  eventType: 'conversation.created.v1';
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
    conversation: {
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
    };
    /**
     * Bootstrap idempotency key accepted by the provider.
     */
    idempotencyKey: string;
  };
}
