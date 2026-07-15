import { randomUUID } from 'expo-crypto';

export function createRuntimeUuid() {
  return randomUUID();
}
