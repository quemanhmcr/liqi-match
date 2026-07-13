import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  useMarkNotificationInboxSeen,
  useNotificationInboxFeed,
  useNotificationInboxSummary,
} from '@/entities/notifications';
import {
  mockNotificationInboxRepository,
  resetMockNotificationInboxForTesting,
} from '@/entities/notifications/data/mock-notification-inbox.repository';
import { useAuth } from '@/shared/auth/auth-context';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

const notificationTestQueryClients = new Set<QueryClient>();

afterEach(() => {
  for (const queryClient of notificationTestQueryClients) queryClient.clear();
  notificationTestQueryClients.clear();
});

function renderNotificationWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
  notificationTestQueryClients.add(queryClient);

  return renderWithProviders(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    {
      serviceOverrides: {
        notificationRepository: mockNotificationInboxRepository,
      },
    },
  );
}

function NotificationHooksHarness() {
  const { session } = useAuth();
  const feed = useNotificationInboxFeed(session);
  const summary = useNotificationInboxSummary(session);
  const mutation = useMarkNotificationInboxSeen(session);
  const watermark = feed.data?.pages[0]?.latestWatermark;

  return (
    <View>
      <Text>{`feed:${feed.data?.pages[0]?.unseenCount ?? 'loading'}`}</Text>
      <Text>{`summary:${summary.data?.unseenCount ?? 'loading'}`}</Text>
      <Text>{`status:${mutation.status}`}</Text>
      <Text>{`error:${mutation.error?.message ?? 'none'}`}</Text>
      {watermark ? (
        <Pressable
          accessibilityLabel="Test mark notification inbox seen"
          onPress={() => mutation.mutate(watermark)}
        />
      ) : null}
    </View>
  );
}

describe('notification inbox hooks', () => {
  beforeEach(async () => {
    await resetMockNotificationInboxForTesting(testAuthSession.user.id);
  });

  it('updates feed and summary caches through one account-scoped mutation', async () => {
    const { findByLabelText, findByText, unmount } =
      await renderNotificationWithProviders(<NotificationHooksHarness />);

    expect(await findByText('feed:3')).toBeTruthy();
    expect(await findByText('summary:3')).toBeTruthy();

    await fireEvent.press(
      await findByLabelText('Test mark notification inbox seen'),
    );

    expect(await findByText('feed:0')).toBeTruthy();
    expect(await findByText('summary:0')).toBeTruthy();
    expect(await findByText('status:success')).toBeTruthy();
    expect(await findByText('error:none')).toBeTruthy();
    await unmount();
  });
});
