import { createContext, useContext, type PropsWithChildren } from 'react';

import type { NotificationInboxRepository } from '../model/notification';

const NotificationRepositoryContext =
  createContext<NotificationInboxRepository | null>(null);

export type NotificationRepositoryProviderProps = PropsWithChildren<{
  repository: NotificationInboxRepository;
}>;

export function NotificationRepositoryProvider({
  children,
  repository,
}: NotificationRepositoryProviderProps) {
  return (
    <NotificationRepositoryContext.Provider value={repository}>
      {children}
    </NotificationRepositoryContext.Provider>
  );
}

export function useNotificationRepository() {
  const repository = useContext(NotificationRepositoryContext);
  if (!repository) {
    throw new Error(
      'NotificationRepositoryProvider is missing from the application composition root.',
    );
  }
  return repository;
}
