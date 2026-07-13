export type ApplicationErrorKind =
  'none' | 'non-retryable' | 'offline' | 'retryable';

export type ApplicationErrorPresentation = Readonly<{
  code?: string;
  kind: ApplicationErrorKind;
  retryable: boolean;
}>;

const offlineCodes = new Set(['network_error', 'offline']);
const retryableCodes = new Set([
  'network_error',
  'offline',
  'rate_limited',
  'stale_cursor',
  'timeout',
]);

export function classifyApplicationError(
  error: unknown,
): ApplicationErrorPresentation {
  if (!error) return { kind: 'none', retryable: false };

  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : undefined;
  const code = typeof record?.code === 'string' ? record.code : undefined;
  const explicitRetryable =
    typeof record?.retryable === 'boolean' ? record.retryable : undefined;
  const retryable =
    explicitRetryable ?? Boolean(code && retryableCodes.has(code));

  if (code && offlineCodes.has(code)) {
    return { code, kind: 'offline', retryable: true };
  }
  if (retryable) {
    return { ...(code ? { code } : {}), kind: 'retryable', retryable: true };
  }
  return {
    ...(code ? { code } : {}),
    kind: 'non-retryable',
    retryable: false,
  };
}
