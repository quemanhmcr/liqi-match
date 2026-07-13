import { describe, expect, it } from '@jest/globals';

import { createAssetKey, isAssetKey, parseAssetKey } from '../asset-key';

describe('AssetKey', () => {
  it.each([
    'asset:profile:minh-anh:avatar',
    'asset:profile:minh-anh:cover',
    'asset:set:sao-bang:artwork',
    'asset:message:victory-photo',
    'asset:shared:avatar-fallback',
  ])('accepts the canonical simulation convention: %s', (value) => {
    expect(isAssetKey(value)).toBe(true);
    expect(createAssetKey(value)).toBe(value);
  });

  it.each([
    'avatar-minh-anh',
    'asset:',
    'asset:Profile:minh-anh:avatar',
    'asset:profile/MinhAnh/avatar',
    'profile:minh-anh',
  ])('rejects invalid asset identities: %s', (value) => {
    expect(isAssetKey(value)).toBe(false);
    expect(() => createAssetKey(value)).toThrow();
  });

  it('parses owner and slot without feature knowledge', () => {
    expect(
      parseAssetKey(createAssetKey('asset:profile:minh-anh:wall:0')),
    ).toEqual({
      key: 'asset:profile:minh-anh:wall:0',
      ownerId: 'profile:minh-anh',
      scope: 'profile',
      slot: 'wall:0',
    });
    expect(
      parseAssetKey(createAssetKey('asset:message:victory-photo')),
    ).toEqual({
      key: 'asset:message:victory-photo',
      ownerId: undefined,
      scope: 'message',
      slot: 'victory-photo',
    });
  });
});
