import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { createAssetKey } from '@/entities/media-asset';

import { DiscoverResolvedImage } from '../components/DiscoverResolvedImage';

const key = createAssetKey('asset:shared:discover-test');

describe('DiscoverResolvedImage', () => {
  it.each(['missing', 'offline-unavailable'] as const)(
    'renders the explicit %s fallback state without crashing',
    async (state) => {
      const screen = await render(
        <DiscoverResolvedImage
          media={{
            kind: 'asset',
            resolved: {
              fallback: 'media-neutral',
              key,
              retryable: state === 'offline-unavailable',
              state,
            },
          }}
          testID="resolved-media"
        />,
      );

      expect(screen.getByLabelText(`Media ${state}`)).toBeTruthy();
      expect(screen.getByTestId('resolved-media').props.source).toBeUndefined();
    },
  );

  it('renders the resolved source when the asset is ready', async () => {
    const source = { uri: 'https://example.test/discover.webp' };
    const screen = await render(
      <DiscoverResolvedImage
        media={{
          kind: 'asset',
          resolved: {
            fallback: 'media-neutral',
            key,
            retryable: false,
            source,
            state: 'ready',
          },
        }}
        testID="resolved-media"
      />,
    );

    expect(screen.getByTestId('resolved-media').props.source).toBe(source);
  });
});
