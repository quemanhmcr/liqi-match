/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

export interface MessageSentV1 {
  /**
   * Globally unique event identifier.
   */
  eventId: string;
  eventType: 'message.sent.v1';
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
    message: {
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
    };
    /**
     * @minItems 1
     */
    recipientPlayerIds: [string, ...string[]];
  };
}
