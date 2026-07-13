/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

export interface ConversationClosedV1 {
  /**
   * Globally unique event identifier.
   */
  eventId: string;
  eventType: 'conversation.closed.v1';
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
    /**
     * ConversationId.
     */
    conversationId: string;
    /**
     * MatchId.
     */
    matchId: string;
    reason: 'unmatched' | 'blocked' | 'retention' | 'administrative';
    /**
     * Authoritative close time.
     */
    closedAt: string;
    version: number;
  };
}
