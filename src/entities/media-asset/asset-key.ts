const assetKeyPrefix = 'asset:v1/' as const;
const idPattern = '[a-z0-9]+(?:-[a-z0-9]+)*';
const profilePattern = new RegExp(
  `^${assetKeyPrefix}profile/(${idPattern})/(avatar|cover)$`,
);
const setPattern = new RegExp(`^${assetKeyPrefix}set/(${idPattern})/artwork$`);
const messagePattern = new RegExp(
  `^${assetKeyPrefix}message/(${idPattern})/image/(${idPattern})$`,
);
const libraryPattern = new RegExp(
  `^${assetKeyPrefix}library/(${idPattern})/(${idPattern})$`,
);

declare const assetKeyBrand: unique symbol;

export type AssetKey = string & { readonly [assetKeyBrand]: true };

export type ParsedAssetKey =
  | {
      key: AssetKey;
      ownerId: string;
      scope: 'profile';
      slot: 'avatar' | 'cover';
    }
  | { key: AssetKey; ownerId: string; scope: 'set'; slot: 'artwork' }
  | { key: AssetKey; ownerId: string; scope: 'message'; slot: string }
  | { key: AssetKey; ownerId: undefined; scope: 'library'; slot: string };

export function isAssetKey(value: string): value is AssetKey {
  return (
    profilePattern.test(value) ||
    setPattern.test(value) ||
    messagePattern.test(value) ||
    libraryPattern.test(value)
  );
}

export function createAssetKey(value: string): AssetKey {
  if (!isAssetKey(value)) {
    throw new Error(
      `Invalid AssetKey "${value}". Expected asset:v1/{profile|set|message|library}/...`,
    );
  }
  return value;
}

export function parseAssetKey(key: AssetKey): ParsedAssetKey {
  const profile = profilePattern.exec(key);
  if (profile?.[1] && profile[2]) {
    return {
      key,
      ownerId: profile[1],
      scope: 'profile',
      slot: profile[2] as 'avatar' | 'cover',
    };
  }

  const set = setPattern.exec(key);
  if (set?.[1]) {
    return { key, ownerId: set[1], scope: 'set', slot: 'artwork' };
  }

  const message = messagePattern.exec(key);
  if (message?.[1] && message[2]) {
    return {
      key,
      ownerId: message[1],
      scope: 'message',
      slot: message[2],
    };
  }

  const library = libraryPattern.exec(key);
  if (library?.[1] && library[2]) {
    return {
      key,
      ownerId: undefined,
      scope: 'library',
      slot: `${library[1]}/${library[2]}`,
    };
  }

  throw new Error(
    `AssetKey passed compile-time validation but cannot be parsed: ${key}`,
  );
}
