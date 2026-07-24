import { describe, expect, it } from '@jest/globals';

import { resolveNotificationRowKind } from '../model/notification-row-presentation';

describe('notification row presentation authority', () => {
  it('reserves rich treatment for data-backed reward or multi-actor content', () => {
    expect(resolveNotificationRowKind({})).toBe('standard');
    expect(resolveNotificationRowKind({ previewAvatars: [] })).toBe('standard');
    expect(resolveNotificationRowKind({ previewAvatars: [{}] })).toBe('rich');
    expect(resolveNotificationRowKind({ reward: {} })).toBe('rich');
  });
});
