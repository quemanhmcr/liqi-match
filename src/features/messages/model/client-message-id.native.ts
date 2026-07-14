import * as Crypto from 'expo-crypto';

export function createClientMessageId(kind: 'media' | 'text') {
  return `client:${kind}:${Crypto.randomUUID()}`;
}
