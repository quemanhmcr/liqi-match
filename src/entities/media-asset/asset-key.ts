import { AssetKeySchema, assetKey, type AssetKey } from '@/entities/simulation';

export type { AssetKey } from '@/entities/simulation';

export type ParsedAssetKey =
  | {
      key: AssetKey;
      ownerId: `profile:${string}`;
      scope: 'profile';
      slot: string;
    }
  | {
      key: AssetKey;
      ownerId: `set:${string}`;
      scope: 'set';
      slot: string;
    }
  | {
      key: AssetKey;
      ownerId: undefined;
      scope: 'message' | 'shared' | 'vibe';
      slot: string;
    }
  | {
      key: AssetKey;
      ownerId: undefined;
      scope: 'other';
      slot: string;
    };

export function isAssetKey(value: string): value is AssetKey {
  return AssetKeySchema.safeParse(value).success;
}

export function createAssetKey(value: string): AssetKey {
  return assetKey(value);
}

export function parseAssetKey(key: AssetKey): ParsedAssetKey {
  const [, scope, id, ...tail] = key.split(':');
  const slot = tail.join(':');

  if (scope === 'profile' && id && slot) {
    return {
      key,
      ownerId: `profile:${id}`,
      scope,
      slot,
    };
  }
  if (scope === 'set' && id && slot) {
    return {
      key,
      ownerId: `set:${id}`,
      scope,
      slot,
    };
  }
  if ((scope === 'message' || scope === 'shared' || scope === 'vibe') && id) {
    return {
      key,
      ownerId: undefined,
      scope,
      slot: [id, ...tail].join(':'),
    };
  }

  return {
    key,
    ownerId: undefined,
    scope: 'other',
    slot: key.slice('asset:'.length),
  };
}
