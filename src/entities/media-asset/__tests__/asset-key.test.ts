import { describe, expect, it } from '@jest/globals';

import { createAssetKey, isAssetKey, parseAssetKey } from '../asset-key';

describe('AssetKey', () => {
  it.each([
    'asset:v1/profile/minh-anh/avatar',
    'asset:v1/profile/minh-anh/cover',
    'asset:v1/set/team-sao-bang/artwork',
    'asset:v1/message/minh-3/image/primary',
    'asset:v1/library/hero/nakroth',
  ])('accepts the canonical v1 convention: %s', (value) => {
    expect(isAssetKey(value)).toBe(true);
    expect(createAssetKey(value)).toBe(value);
  });

  it.each([
    'avatar-minh-anh',
    'asset:v2/profile/minh-anh/avatar',
    'asset:v1/profile/MinhAnh/avatar',
    'asset:v1/profile/minh-anh/artwork',
    'asset:v1/message/minh-3/image',
  ])('rejects non-canonical keys: %s', (value) => {
    expect(isAssetKey(value)).toBe(false);
    expect(() => createAssetKey(value)).toThrow('Invalid AssetKey');
  });

  it('parses owner and slot without feature knowledge', () => {
    expect(
      parseAssetKey(createAssetKey('asset:v1/profile/minh-anh/avatar')),
    ).toEqual({
      key: 'asset:v1/profile/minh-anh/avatar',
      ownerId: 'minh-anh',
      scope: 'profile',
      slot: 'avatar',
    });
    expect(
      parseAssetKey(createAssetKey('asset:v1/library/hero/nakroth')),
    ).toEqual({
      key: 'asset:v1/library/hero/nakroth',
      ownerId: undefined,
      scope: 'library',
      slot: 'hero/nakroth',
    });
  });
});
