import { describe, expect, it } from '@jest/globals';

import { matchIntentQueryKeys } from '../match-intent-queries';

describe('matchIntentQueryKeys', () => {
  it('separates current Match Intent caches by canonical PlayerId', () => {
    expect(matchIntentQueryKeys.current('player-a')).not.toEqual(
      matchIntentQueryKeys.current('player-b'),
    );
  });
});
