export class ApplicationServiceUnavailableError extends Error {
  readonly retryable = false;

  constructor(readonly service: string) {
    super(
      `${service} is not available in the selected application runtime mode.`,
    );
    this.name = 'ApplicationServiceUnavailableError';
  }
}
