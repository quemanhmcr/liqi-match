import type { NotificationInboxRepository } from '@/entities/notifications';
import type { DiscoverRepository } from '@/features/discover';
import type { HomeRepository } from '@/features/home';
import type { ChatMessageTransport, ChatRepository } from '@/features/messages';
import type { ProfileReadRepository } from '@/features/profile';

import type { ApplicationRuntimeMode } from './application-runtime-mode';

export type ApplicationServices = {
  discoverRepository: DiscoverRepository;
  homeRepository: HomeRepository;
  messageRepository: ChatRepository;
  messageTransport: ChatMessageTransport;
  mode: ApplicationRuntimeMode;
  notificationRepository: NotificationInboxRepository;
  profileRepository: ProfileReadRepository;
};
