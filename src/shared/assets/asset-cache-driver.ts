export type AssetCacheLoadState = 'corrupt' | 'missing' | 'ready';

export type AssetCacheLoadResult = {
  cacheUri?: string;
  state: AssetCacheLoadState;
};

export interface AssetCacheDriver {
  clear(): Promise<void>;
  isRemoteCached(url: string): Promise<boolean>;
  preloadBundled(module: number): Promise<AssetCacheLoadResult>;
  preloadLocal(uri: string): Promise<AssetCacheLoadResult>;
  preloadRemote(url: string): Promise<AssetCacheLoadResult>;
}

export const passiveAssetCacheDriver: AssetCacheDriver = {
  async clear() {},
  async isRemoteCached() {
    return false;
  },
  async preloadBundled() {
    return { state: 'ready' };
  },
  async preloadLocal() {
    return { state: 'ready' };
  },
  async preloadRemote() {
    return { state: 'ready' };
  },
};
