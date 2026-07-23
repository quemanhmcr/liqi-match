import { describe, expect, it } from '@jest/globals';

import { isSameMessageInboxQueryScope } from '../queries/messages-queries';

describe('messages inbox query scope', () => {
  const base = ['messages', 'inbox', 'viewer', 1] as const;

  it('keeps previous data only when the query segment changes', () => {
    expect(
      isSameMessageInboxQueryScope(
        [...base, 'all', ''],
        [...base, 'all', 'Khoa'],
      ),
    ).toBe(true);
  });

  it('does not carry rows across filter or viewer scope changes', () => {
    expect(
      isSameMessageInboxQueryScope(
        [...base, 'all', ''],
        [...base, 'group', ''],
      ),
    ).toBe(false);
    expect(
      isSameMessageInboxQueryScope(
        ['messages', 'inbox', 'viewer-a', 1, 'all', ''],
        ['messages', 'inbox', 'viewer-b', 1, 'all', ''],
      ),
    ).toBe(false);
  });
});
