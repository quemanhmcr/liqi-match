import type { PropsWithChildren } from 'react';

import { NotificationRepositoryProvider } from '@/entities/notifications';
import { DiscoverRepositoryProvider } from '@/features/discover';
import { HomeRepositoryProvider } from '@/features/home';
import { MessagesServicesProvider } from '@/features/messages';
import { ProfileReadRepositoryProvider } from '@/features/profile';

import type { ApplicationServices } from '../runtime/application-services';

export type ApplicationServiceProvidersProps = PropsWithChildren<{
  services: ApplicationServices;
}>;

export function ApplicationServiceProviders({
  children,
  services,
}: ApplicationServiceProvidersProps) {
  return (
    <DiscoverRepositoryProvider repository={services.discoverRepository}>
      <HomeRepositoryProvider repository={services.homeRepository}>
        <MessagesServicesProvider
          messageTransport={services.messageTransport}
          repository={services.messageRepository}
        >
          <NotificationRepositoryProvider
            repository={services.notificationRepository}
          >
            <ProfileReadRepositoryProvider
              repository={services.profileRepository}
            >
              {children}
            </ProfileReadRepositoryProvider>
          </NotificationRepositoryProvider>
        </MessagesServicesProvider>
      </HomeRepositoryProvider>
    </DiscoverRepositoryProvider>
  );
}
