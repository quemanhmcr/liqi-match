/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */

export interface ConversationBootstrapRequestedV1 {
  /**
   * Globally unique event identifier.
   */
  eventId: string;
  eventType: 'conversation.bootstrap_requested.v1';
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
     * Authoritative MatchId supplied by Mission 2.
     */
    matchId: string;
    /**
     * @minItems 2
     * @maxItems 2
     */
    participantIds: [string, string];
    /**
     * Stable bootstrap idempotency key for this match.
     */
    idempotencyKey: string;
  };
}
