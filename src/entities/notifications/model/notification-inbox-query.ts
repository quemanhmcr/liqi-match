import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import type { AuthSession } from '@/shared/auth/auth-service';

import { useNotificationRepository } from '../runtime/NotificationRepositoryProvider';
import {
  compareNotificationWatermarks,
  isAtOrBeforeNotificationWatermark,
  type NotificationInboxPage,
  type NotificationInboxSummary,
  type NotificationRecord,
  type NotificationSeenWatermark,
} from './notification';

export const notificationInboxQueryKeys = {
  all: ['notification-inbox'] as const,
  feed: (userId: string) =>
    [...notificationInboxQueryKeys.all, 'feed', userId] as const,
  summary: (userId: string) =>
    [...notificationInboxQueryKeys.all, 'summary', userId] as const,
};

export type NotificationInboxFeedData = InfiniteData<
  NotificationInboxPage,
  string | null
>;

export function useNotificationInboxFeed(session: AuthSession | null) {
  const notificationInboxRepository = useNotificationRepository();
  return useInfiniteQuery<
    NotificationInboxPage,
    Error,
    NotificationInboxFeedData,
    ReturnType<typeof notificationInboxQueryKeys.feed>,
    string | null
  >({
    enabled: Boolean(session),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (!session) throw new Error('Notification feed requires a session.');
      return notificationInboxRepository.list({
        cursor: pageParam ?? undefined,
        session,
        signal,
      });
    },
    queryKey: notificationInboxQueryKeys.feed(session?.user.id ?? 'anonymous'),
    staleTime: 15_000,
  });
}

export function useNotificationInboxSummary(session: AuthSession | null) {
  const notificationInboxRepository = useNotificationRepository();
  return useQuery({
    enabled: Boolean(session),
    queryFn: ({ signal }) => {
      if (!session) throw new Error('Notification summary requires a session.');
      return notificationInboxRepository.getSummary({ session, signal });
    },
    queryKey: notificationInboxQueryKeys.summary(
      session?.user.id ?? 'anonymous',
    ),
    staleTime: 15_000,
  });
}

export function useMarkNotificationInboxSeen(session: AuthSession | null) {
  const notificationInboxRepository = useNotificationRepository();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? 'anonymous';

  return useMutation({
    mutationFn: async (seenThrough: NotificationSeenWatermark) => {
      if (!session)
        throw new Error('Marking notifications seen requires a session.');
      return notificationInboxRepository.markSeenThrough({
        seenThrough,
        session,
      });
    },
    mutationKey: [...notificationInboxQueryKeys.all, 'mark-seen', userId],
    onError: (_error, _seenThrough, context) => {
      if (!context) return;
      restoreNotificationQueries(queryClient, userId, context);
    },
    onMutate: async (seenThrough) => {
      await cancelNotificationQueries(queryClient, userId);
      const context = snapshotNotificationQueries(queryClient, userId);
      const optimisticSeenAt = new Date().toISOString();

      queryClient.setQueryData<NotificationInboxFeedData>(
        notificationInboxQueryKeys.feed(userId),
        (feed) =>
          feed
            ? markNotificationFeedSeenThrough(
                feed,
                seenThrough,
                optimisticSeenAt,
              )
            : feed,
      );
      queryClient.setQueryData<NotificationInboxSummary>(
        notificationInboxQueryKeys.summary(userId),
        (summary) =>
          summary
            ? markNotificationSummarySeenThrough(summary, seenThrough)
            : summary,
      );

      return context;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<NotificationInboxFeedData>(
        notificationInboxQueryKeys.feed(userId),
        (feed) =>
          feed
            ? setNotificationFeedUnseenCount(
                markNotificationFeedSeenThrough(
                  feed,
                  result.seenThrough,
                  result.seenAt,
                ),
                result.unseenCount,
              )
            : feed,
      );
      queryClient.setQueryData<NotificationInboxSummary>(
        notificationInboxQueryKeys.summary(userId),
        (summary) =>
          summary
            ? {
                ...summary,
                unseenCount: result.unseenCount,
                updatedAt: result.seenAt,
              }
            : summary,
      );
    },
    onSettled: () => invalidateNotificationQueries(queryClient, userId),
  });
}

export function useMarkNotificationRead(session: AuthSession | null) {
  const notificationInboxRepository = useNotificationRepository();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? 'anonymous';

  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (!session)
        throw new Error('Marking a notification read requires a session.');
      return notificationInboxRepository.markRead({ notificationId, session });
    },
    mutationKey: [...notificationInboxQueryKeys.all, 'mark-read', userId],
    onError: (_error, _notificationId, context) => {
      if (!context) return;
      restoreNotificationQueries(queryClient, userId, context);
    },
    onMutate: async (notificationId) => {
      await cancelNotificationQueries(queryClient, userId);
      const context = snapshotNotificationQueries(queryClient, userId);
      const optimisticReadAt = new Date().toISOString();
      const selected = findNotificationInFeed(context.feed, notificationId);

      queryClient.setQueryData<NotificationInboxFeedData>(
        notificationInboxQueryKeys.feed(userId),
        (feed) =>
          feed
            ? markNotificationFeedRead(feed, notificationId, optimisticReadAt)
            : feed,
      );
      if (selected && !selected.seenAt) {
        queryClient.setQueryData<NotificationInboxSummary>(
          notificationInboxQueryKeys.summary(userId),
          (summary) =>
            summary
              ? {
                  ...summary,
                  unseenCount: Math.max(0, summary.unseenCount - 1),
                  updatedAt: optimisticReadAt,
                }
              : summary,
        );
      }

      return context;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<NotificationInboxFeedData>(
        notificationInboxQueryKeys.feed(userId),
        (feed) =>
          feed
            ? replaceNotificationInFeed(
                feed,
                result.notification,
                result.unseenCount,
              )
            : feed,
      );
      queryClient.setQueryData<NotificationInboxSummary>(
        notificationInboxQueryKeys.summary(userId),
        (summary) =>
          summary ? { ...summary, unseenCount: result.unseenCount } : summary,
      );
    },
    onSettled: () => invalidateNotificationQueries(queryClient, userId),
  });
}

export function markNotificationFeedSeenThrough(
  feed: NotificationInboxFeedData,
  seenThrough: NotificationSeenWatermark,
  seenAt: string,
): NotificationInboxFeedData {
  let newlySeenCount = 0;
  const pages = feed.pages.map((page) => ({
    ...page,
    items: page.items.map((notification) => {
      if (
        notification.seenAt ||
        !isAtOrBeforeNotificationWatermark(notification, seenThrough)
      ) {
        return notification;
      }

      newlySeenCount += 1;
      return { ...notification, seenAt } as NotificationRecord;
    }),
  }));
  const currentUnseenCount = feed.pages[0]?.unseenCount ?? 0;
  const latestWatermark = feed.pages[0]?.latestWatermark ?? null;
  const coversCurrentInbox =
    latestWatermark &&
    compareNotificationWatermarks(latestWatermark, seenThrough) <= 0;
  const unseenCount = coversCurrentInbox
    ? 0
    : Math.max(0, currentUnseenCount - newlySeenCount);

  return {
    ...feed,
    pages: pages.map((page) => ({ ...page, unseenCount })),
  };
}

export function markNotificationFeedRead(
  feed: NotificationInboxFeedData,
  notificationId: string,
  readAt: string,
): NotificationInboxFeedData {
  let newlySeen = false;
  const pages = feed.pages.map((page) => ({
    ...page,
    items: page.items.map((notification) => {
      if (notification.id !== notificationId) return notification;
      newlySeen = !notification.seenAt;
      return {
        ...notification,
        readAt: notification.readAt ?? readAt,
        seenAt: notification.seenAt ?? readAt,
      } as NotificationRecord;
    }),
  }));
  const unseenCount = Math.max(
    0,
    (feed.pages[0]?.unseenCount ?? 0) - (newlySeen ? 1 : 0),
  );

  return {
    ...feed,
    pages: pages.map((page) => ({ ...page, unseenCount })),
  };
}

export function markNotificationPageSeenThrough(
  page: NotificationInboxPage,
  seenThrough: NotificationSeenWatermark,
  seenAt: string,
): NotificationInboxPage {
  let newlySeenCount = 0;
  const items = page.items.map((notification) => {
    if (
      notification.seenAt ||
      !isAtOrBeforeNotificationWatermark(notification, seenThrough)
    ) {
      return notification;
    }

    newlySeenCount += 1;
    return { ...notification, seenAt } as NotificationRecord;
  });

  return {
    ...page,
    items,
    unseenCount: Math.max(0, page.unseenCount - newlySeenCount),
  };
}

export function markNotificationSummarySeenThrough(
  summary: NotificationInboxSummary,
  seenThrough: NotificationSeenWatermark,
): NotificationInboxSummary {
  if (
    summary.latestWatermark &&
    compareNotificationWatermarks(summary.latestWatermark, seenThrough) > 0
  ) {
    return summary;
  }

  return { ...summary, unseenCount: 0 };
}

export function markNotificationPageRead(
  page: NotificationInboxPage,
  notificationId: string,
  readAt: string,
): NotificationInboxPage {
  let newlySeen = false;
  const items = page.items.map((notification) => {
    if (notification.id !== notificationId) return notification;
    newlySeen = !notification.seenAt;
    return {
      ...notification,
      readAt: notification.readAt ?? readAt,
      seenAt: notification.seenAt ?? readAt,
    } as NotificationRecord;
  });

  return {
    ...page,
    items,
    unseenCount: Math.max(0, page.unseenCount - (newlySeen ? 1 : 0)),
  };
}

type NotificationQuerySnapshot = {
  feed?: NotificationInboxFeedData;
  summary?: NotificationInboxSummary;
};

function findNotificationInFeed(
  feed: NotificationInboxFeedData | undefined,
  notificationId: string,
) {
  return feed?.pages
    .flatMap((page) => page.items)
    .find((notification) => notification.id === notificationId);
}

function replaceNotificationInFeed(
  feed: NotificationInboxFeedData,
  replacement: NotificationRecord,
  unseenCount: number,
): NotificationInboxFeedData {
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.map((notification) =>
        notification.id === replacement.id ? replacement : notification,
      ),
      unseenCount,
    })),
  };
}

function setNotificationFeedUnseenCount(
  feed: NotificationInboxFeedData,
  unseenCount: number,
): NotificationInboxFeedData {
  return {
    ...feed,
    pages: feed.pages.map((page) => ({ ...page, unseenCount })),
  };
}

async function cancelNotificationQueries(
  queryClient: QueryClient,
  userId: string,
) {
  await Promise.all([
    queryClient.cancelQueries({
      queryKey: notificationInboxQueryKeys.feed(userId),
    }),
    queryClient.cancelQueries({
      queryKey: notificationInboxQueryKeys.summary(userId),
    }),
  ]);
}

function snapshotNotificationQueries(
  queryClient: QueryClient,
  userId: string,
): NotificationQuerySnapshot {
  return {
    feed: queryClient.getQueryData(notificationInboxQueryKeys.feed(userId)),
    summary: queryClient.getQueryData(
      notificationInboxQueryKeys.summary(userId),
    ),
  };
}

function restoreNotificationQueries(
  queryClient: QueryClient,
  userId: string,
  snapshot: NotificationQuerySnapshot,
) {
  queryClient.setQueryData(
    notificationInboxQueryKeys.feed(userId),
    snapshot.feed,
  );
  queryClient.setQueryData(
    notificationInboxQueryKeys.summary(userId),
    snapshot.summary,
  );
}

async function invalidateNotificationQueries(
  queryClient: QueryClient,
  userId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: notificationInboxQueryKeys.feed(userId),
    }),
    queryClient.invalidateQueries({
      queryKey: notificationInboxQueryKeys.summary(userId),
    }),
  ]);
}
