export type ConversationTelemetryEvent =
  | 'conversation.gap_recovery.failed'
  | 'conversation.gap_recovery.succeeded'
  | 'conversation.read.failed'
  | 'conversation.relationship_access.revoked'
  | 'conversation.relationship_access.unavailable'
  | 'conversation.read.succeeded'
  | 'conversation.realtime.connected'
  | 'conversation.realtime.disconnected'
  | 'conversation.realtime.message_signal'
  | 'conversation.send.failed'
  | 'conversation.send.started'
  | 'conversation.send.succeeded';

export type ConversationTelemetryAttributes = Readonly<
  Record<string, boolean | number | string>
>;

export type ConversationTelemetrySink = (
  event: ConversationTelemetryEvent,
  attributes?: ConversationTelemetryAttributes,
) => void;

let sink: ConversationTelemetrySink = () => undefined;

export function setConversationTelemetrySink(
  nextSink: ConversationTelemetrySink,
): () => void {
  const previous = sink;
  sink = nextSink;
  return () => {
    sink = previous;
  };
}

export function emitConversationTelemetry(
  event: ConversationTelemetryEvent,
  attributes?: ConversationTelemetryAttributes,
): void {
  try {
    sink(event, attributes);
  } catch (error) {
    console.error('[conversation.telemetry_sink_failed]', error);
  }
}
