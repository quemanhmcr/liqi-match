import { Image as ExpoImage } from 'expo-image';

import type {
  AssetCacheDriver,
  AssetCacheLoadResult,
} from './asset-cache-driver';

function failedLoad(error: unknown): AssetCacheLoadResult {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return {
    state:
      message.includes('decode') || message.includes('corrupt')
        ? 'corrupt'
        : 'missing',
  };
}

export const expoImageCacheDriver: AssetCacheDriver = {
  async clear() {
    await Promise.all([
      ExpoImage.clearMemoryCache().catch(() => false),
      ExpoImage.clearDiskCache().catch(() => false),
    ]);
  },

  async isRemoteCached(url) {
    return Boolean(await ExpoImage.getCachePathAsync(url).catch(() => null));
  },

  async preloadBundled(module) {
    try {
      await ExpoImage.loadAsync(module);
      return { state: 'ready' };
    } catch (error) {
      return failedLoad(error);
    }
  },

  async preloadLocal(uri) {
    try {
      await ExpoImage.loadAsync({ uri });
      return { state: 'ready' };
    } catch (error) {
      return failedLoad(error);
    }
  },

  async preloadRemote(url) {
    try {
      const loaded = await ExpoImage.prefetch(url, {
        cachePolicy: 'memory-disk',
      });
      return { state: loaded ? 'ready' : 'missing' };
    } catch (error) {
      return failedLoad(error);
    }
  },
};
