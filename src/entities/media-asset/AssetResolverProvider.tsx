import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from 'react';

import type { AssetPreloadSurface } from './asset-preload-plan';
import { preloadGoldenWorldAssetSurface } from './asset-preload-plan';
import type { AssetResolver } from './asset-resolver';

const AssetResolverContext = createContext<AssetResolver | null>(null);

export type AssetResolverProviderProps = PropsWithChildren<{
  resolver: AssetResolver;
}>;

export function AssetResolverProvider({
  children,
  resolver,
}: AssetResolverProviderProps) {
  return (
    <AssetResolverContext.Provider value={resolver}>
      {children}
    </AssetResolverContext.Provider>
  );
}

export function useAssetResolver() {
  const resolver = useContext(AssetResolverContext);
  if (!resolver) {
    throw new Error(
      'AssetResolverProvider is missing from the application composition root.',
    );
  }
  return resolver;
}

export function usePreloadAssetSurface(surface: AssetPreloadSurface) {
  const resolver = useAssetResolver();

  useEffect(() => {
    let active = true;
    void preloadGoldenWorldAssetSurface(resolver, surface).catch(() => {
      if (!active) return;
      // Resolution state remains authoritative; consumers render its fallback.
    });
    return () => {
      active = false;
    };
  }, [resolver, surface]);
}
