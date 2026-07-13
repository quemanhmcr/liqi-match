import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { createAssetKey } from '@/entities/media-asset';

import { NotificationResolvedImage } from '../components/NotificationResolvedImage';

const key = createAssetKey('asset:shared:notification-test');

describe('NotificationResolvedImage', () => {
  it.each(['missing', 'offline-unavailable'] as const)(
    'renders the explicit %s fallback state',
    async (state) => {
      const screen = await render(
        <NotificationResolvedImage
          media={{
            kind: 'asset',
            resolved: {
              fallback: 'avatar-neutral',
              key,
              retryable: state === 'offline-unavailable',
              state,
            },
          }}
          testID="notification-media"
        />,
      );

      expect(screen.getByLabelText(`Notification media ${state}`)).toBeTruthy();
      expect(
        screen.getByTestId('notification-media').props.source,
      ).toBeUndefined();
    },
  );

  it('renders a ready remote source', async () => {
    const source = { uri: 'https://example.test/notification.webp' };
    const screen = await render(
      <NotificationResolvedImage
        media={{ kind: 'remote', source, state: 'ready' }}
        testID="notification-media"
      />,
    );

    expect(screen.getByTestId('notification-media').props.source).toBe(source);
  });
});
