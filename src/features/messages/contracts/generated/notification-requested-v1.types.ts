/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

export interface NotificationRequestedV1 {
  /**
   * Globally unique event identifier.
   */
  eventId: string;
  eventType: 'notification.requested.v1';
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
    reason: 'message_received';
    /**
     * PlayerId that should receive attention.
     */
    recipientPlayerId: string;
    /**
     * ConversationId deep-link target.
     */
    conversationId: string;
    /**
     * MessageId that triggered attention.
     */
    messageId: string;
    /**
     * PlayerId that sent the message.
     */
    senderPlayerId: string;
    authoritativeUnreadCount: number;
    foregroundPolicy: 'suppress_push' | 'allow_push';
  };
}
