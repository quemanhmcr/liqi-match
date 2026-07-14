export type SocialCommandOperation =
  | 'accept_friendship'
  | 'block_player'
  | 'cancel_friendship'
  | 'decline_friendship'
  | 'mute_player'
  | 'remove_friendship'
  | 'report_message'
  | 'report_player'
  | 'request_friendship'
  | 'unblock_player'
  | 'unmute_player'
  | 'update_privacy';

export type SocialTelemetryEvent =
  | 'social.command.failed'
  | 'social.command.started'
  | 'social.command.succeeded'
  | 'social.report_evidence.completed'
  | 'social.report_evidence.pending'
  | 'social.report_evidence.persistence_failed';

export type SocialTelemetryAttributes = Readonly<
  Record<string, boolean | number | string>
>;

export type SocialTelemetrySink = (
  event: SocialTelemetryEvent,
  attributes?: SocialTelemetryAttributes,
) => void;

let sink: SocialTelemetrySink = () => undefined;

export function setSocialTelemetrySink(
  nextSink: SocialTelemetrySink,
): () => void {
  const previous = sink;
  sink = nextSink;
  return () => {
    sink = previous;
  };
}

export function emitSocialTelemetry(
  event: SocialTelemetryEvent,
  attributes?: SocialTelemetryAttributes,
): void {
  try {
    sink(event, attributes);
  } catch (error) {
    console.error('[social.telemetry_sink_failed]', error);
  }
}

export function socialTelemetryErrorAttributes(error: unknown) {
  const candidate =
    error && typeof error === 'object'
      ? (error as { code?: unknown; retryable?: unknown })
      : null;
  return {
    code:
      typeof candidate?.code === 'string'
        ? candidate.code
        : error instanceof Error
          ? error.name
          : 'unknown',
    retryable: candidate?.retryable === true,
  } as const;
}
