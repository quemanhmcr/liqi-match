import { describe, expect, it } from '@jest/globals';

import { isConversationV2Enabled } from './conversation-v2-rollout';

describe('Conversation V2 rollout flag', () => {
  it.each(['true', 'TRUE', '1', 'yes', ' yes '])(
    'enables only explicit truthy value %s',
    (value) => expect(isConversationV2Enabled(value)).toBe(true),
  );

  it.each(['', 'false', 'FALSE', '0', 'no', ' no '])(
    'keeps V1 for explicit disabled value %s',
    (value) => expect(isConversationV2Enabled(value)).toBe(false),
  );

  it('fails fast instead of silently selecting an authority for invalid values', () => {
    expect(() => isConversationV2Enabled('rollout')).toThrow(
      'EXPO_PUBLIC_CONVERSATION_V2_ENABLED',
    );
  });
});
