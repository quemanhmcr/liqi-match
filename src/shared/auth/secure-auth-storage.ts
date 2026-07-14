import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  ChunkedSecureAuthStorage,
  MemoryAuthStorage,
  type AuthStringStorage,
  type SecureAuthStorageBackend,
  type SecureAuthStorageTelemetry,
} from './secure-auth-storage-core';

export * from './secure-auth-storage-core';

function createNativeBackend(): SecureAuthStorageBackend {
  const availability = SecureStore.isAvailableAsync();
  const options: SecureStore.SecureStoreOptions = {
    keychainService: 'liqi-match-auth-v1',
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: false,
  };
  const ensureAvailable = async () => {
    if (!(await availability)) {
      throw new Error('SecureStore is unavailable on this device.');
    }
  };
  return {
    async getItem(key) {
      await ensureAvailable();
      return SecureStore.getItemAsync(key, options);
    },
    async setItem(key, value) {
      await ensureAvailable();
      await SecureStore.setItemAsync(key, value, options);
    },
    async removeItem(key) {
      await ensureAvailable();
      await SecureStore.deleteItemAsync(key, options);
    },
  };
}

async function sha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export function createSecureAuthStorage(
  telemetry?: SecureAuthStorageTelemetry,
): AuthStringStorage {
  if (Platform.OS === 'web') return new MemoryAuthStorage();
  return new ChunkedSecureAuthStorage({
    backend: createNativeBackend(),
    digest: sha256,
    telemetry,
  });
}
