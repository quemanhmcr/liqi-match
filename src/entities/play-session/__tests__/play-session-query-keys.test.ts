import { describe, expect, it } from '@jest/globals';

import { playSessionQueryKeys } from '../play-session-query-keys';

describe('playSessionQueryKeys', () => {
  it('scopes current, invite and detail caches by canonical PlayerId', () => {
    const playerA = '20000000-0000-4000-8000-000000000001';
    const playerB = '20000000-0000-4000-8000-000000000002';
    const sessionId = '90000000-0000-4000-8000-000000000001';

    expect(playSessionQueryKeys.current(playerA)).not.toEqual(
      playSessionQueryKeys.current(playerB),
    );
    expect(playSessionQueryKeys.invites(playerA)).not.toEqual(
      playSessionQueryKeys.invites(playerB),
    );
    expect(playSessionQueryKeys.detail(playerA, sessionId)).not.toEqual(
      playSessionQueryKeys.detail(playerB, sessionId),
    );
  });
});
