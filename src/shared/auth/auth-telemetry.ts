export type AuthTelemetryEvent =
  | 'auth.callback.rejected'
  | 'auth.foreground_sync.failed'
  | 'auth.legacy_storage_cleanup.failed'
  | 'auth.legacy_storage_cleanup.succeeded'
  | 'auth.pkce.cancelled'
  | 'auth.pkce.failed'
  | 'auth.pkce.succeeded'
  | 'auth.refresh.failed'
  | 'auth.refresh.succeeded'
  | 'auth.restore.failed'
  | 'auth.restore.started'
  | 'auth.restore.succeeded'
  | 'auth.session_event.failed'
  | 'auth.signed_out'
  | 'identity.bootstrap.failed'
  | 'identity.bootstrap.succeeded'
  | 'identity.resolve.failed'
  | 'identity.resolve.succeeded';

export type AuthTelemetrySink = (
  event: AuthTelemetryEvent,
  attributes?: Readonly<Record<string, string | number | boolean>>,
) => void;

let sink: AuthTelemetrySink = () => undefined;

export function setAuthTelemetrySink(nextSink: AuthTelemetrySink): () => void {
  const previous = sink;
  sink = nextSink;
  return () => {
    sink = previous;
  };
}

export function emitAuthTelemetry(
  event: AuthTelemetryEvent,
  attributes?: Readonly<Record<string, string | number | boolean>>,
): void {
  sink(event, attributes);
}
