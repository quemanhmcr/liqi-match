import { describe, expect, it } from '@jest/globals';

import { resolveMessageInboxComposePlacement } from '../model/message-inbox-compose';

describe('message inbox compose placement', () => {
  it('promotes compose when the resolved unfiltered inbox is truly empty', () => {
    expect(
      resolveMessageInboxComposePlacement({
        filter: 'all',
        inboxReady: true,
        query: '',
        resultCount: 0,
      }),
    ).toBe('empty-state');
  });

  it.each<
    [
      filter: 'all' | 'group',
      inboxReady: boolean,
      query: string,
      resultCount: number | undefined,
    ]
  >([
    ['all', false, '', 0],
    ['all', true, '', undefined],
    ['all', true, '', 3],
    ['all', true, 'Khoa', 0],
    ['group', true, '', 0],
  ])(
    'keeps compose in the header for filter=%s ready=%s query=%s count=%s',
    (filter, inboxReady, query, resultCount) => {
      expect(
        resolveMessageInboxComposePlacement({
          filter,
          inboxReady,
          query,
          resultCount,
        }),
      ).toBe('header-only');
    },
  );
});
