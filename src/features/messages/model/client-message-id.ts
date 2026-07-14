export function createClientMessageId(kind: 'media' | 'text') {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) {
    throw new Error(
      'A cryptographically secure UUID generator is unavailable.',
    );
  }
  return `client:${kind}:${randomUUID()}`;
}
