import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from 'react';
import type { AuthSession } from '@/shared/auth/auth-service';
import { useAuth } from '@/shared/auth/auth-context';

import { setChatPendingMessagePersistenceScope } from '../model/chat-runtime-store';

import type { ChatMessageTransport } from '../services/chat-message-transport';
import type { ChatRepository } from '../services/chat-repository';

export type MessagesServices = {
  messageTransport: ChatMessageTransport;
  repository: ChatRepository;
};

const MessagesServicesContext = createContext<MessagesServices | null>(null);

export type MessagesServicesProviderProps = PropsWithChildren<MessagesServices>;

export function conversationTransportSession(
  session: AuthSession | null,
): AuthSession | null {
  if (!session) return null;

  // Simulation and legacy tests do not publish authoritative player context.
  // Production sessions that do publish a principal fail closed unless the
  // lifecycle snapshot authorizes messaging for the same PlayerId.
  if (!session.principal && session.lifecycle === undefined) return session;
  if (!session.principal || !session.lifecycle) return null;
  if (session.principal.playerId !== session.lifecycle.playerId) return null;
  if (session.lifecycle.state !== 'active') return null;
  if (!session.lifecycle.messagingAllowed) return null;
  return session;
}

export function MessagesServicesProvider({
  children,
  messageTransport,
  repository,
}: MessagesServicesProviderProps) {
  const { session } = useAuth();

  useEffect(() => {
    void messageTransport.setSession?.(conversationTransportSession(session));
  }, [messageTransport, session]);

  useEffect(() => {
    if (!messageTransport.setSession) return;
    void setChatPendingMessagePersistenceScope(
      session?.principal?.accountId ?? session?.user.id ?? null,
    );
  }, [messageTransport, session?.principal?.accountId, session?.user.id]);

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
