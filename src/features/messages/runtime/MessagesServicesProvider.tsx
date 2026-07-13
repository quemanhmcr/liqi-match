import { createContext, useContext, type PropsWithChildren } from 'react';

import type { ChatMessageTransport } from '../services/chat-message-transport';
import type { ChatRepository } from '../services/chat-repository';

export type MessagesServices = {
  messageTransport: ChatMessageTransport;
  repository: ChatRepository;
};

const MessagesServicesContext = createContext<MessagesServices | null>(null);

export type MessagesServicesProviderProps = PropsWithChildren<MessagesServices>;

export function MessagesServicesProvider({
  children,
  messageTransport,
  repository,
}: MessagesServicesProviderProps) {
  return (
    <MessagesServicesContext.Provider value={{ messageTransport, repository }}>
      {children}
    </MessagesServicesContext.Provider>
  );
}

export function useMessagesServices() {
  const services = useContext(MessagesServicesContext);
  if (!services) {
    throw new Error(
      'MessagesServicesProvider is missing from the application composition root.',
    );
  }
  return services;
}
