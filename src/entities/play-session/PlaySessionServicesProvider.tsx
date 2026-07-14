import { createContext, type PropsWithChildren, useContext } from 'react';

import type {
  PlaySessionCommandService,
  PlaySessionRepository,
} from './play-session-repository';
import type {
  ConversationRepository,
  MessageTransport,
} from '@/entities/conversation-v2';

type PlaySessionServices = Readonly<{
  commandService: PlaySessionCommandService;
  repository: PlaySessionRepository;
  conversationRepository: ConversationRepository | null;
  conversationMessageTransport: MessageTransport | null;
}>;

const PlaySessionServicesContext = createContext<
  PlaySessionServices | undefined
>(undefined);

export function PlaySessionServicesProvider({
  children,
  commandService,
  repository,
  conversationRepository,
  conversationMessageTransport,
}: PropsWithChildren<PlaySessionServices>) {
  return (
    <PlaySessionServicesContext.Provider
      value={{
        commandService,
        repository,
        conversationRepository,
        conversationMessageTransport,
      }}
    >
      {children}
    </PlaySessionServicesContext.Provider>
  );
}

export function usePlaySessionServices() {
  const value = useContext(PlaySessionServicesContext);
  if (!value) {
    throw new Error(
      'usePlaySessionServices must be used within PlaySessionServicesProvider.',
    );
  }
  return value;
}
