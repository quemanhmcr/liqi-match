import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { createAssetKey } from '@/entities/media-asset';

import { MessageResolvedImage } from '../components/MessageResolvedImage';

const key = createAssetKey('asset:shared:message-test');

describe('MessageResolvedImage', () => {
  it.each(['missing', 'offline-unavailable'] as const)(
    'renders the explicit %s fallback state',
    async (state) => {
      const screen = await render(
        <MessageResolvedImage
          media={{
            kind: 'asset',
            resolved: {
              fallback: 'media-neutral',
              key,
              retryable: state === 'offline-unavailable',
              state,
            },
          }}
          testID="message-media"
        />,
      );

      expect(screen.getByLabelText(`Message media ${state}`)).toBeTruthy();
      expect(screen.getByTestId('message-media').props.source).toBeUndefined();
    },
  );

  it('renders the ready source', async () => {
    const source = { uri: 'https://example.test/message.webp' };
    const screen = await render(
      <MessageResolvedImage
        media={{ kind: 'remote', source, state: 'ready', uri: source.uri }}
        testID="message-media"
      />,
    );

    expect(screen.getByTestId('message-media').props.source).toBe(source);
  });
});
