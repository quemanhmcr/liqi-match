export function createRuntimeUuid() {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) {
    throw new Error('Secure random UUID generation is unavailable.');
  }
  return randomUUID();
}
