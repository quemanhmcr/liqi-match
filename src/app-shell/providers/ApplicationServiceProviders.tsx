import type { PropsWithChildren } from 'react';

import { MatchDecisionRepositoryProvider } from '@/entities/match-decision';
import { MatchIntentRepositoryProvider } from '@/entities/match-intent';
import {
  AssetResolverProvider,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
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
    <AssetResolverProvider resolver={services.assetResolver}>
      <ApplicationAssetPreloader />
      <MatchIntentRepositoryProvider
        repository={services.matchIntentRepository}
      >
        <MatchDecisionRepositoryProvider
          repository={services.matchDecisionRepository}
        >
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
        </MatchDecisionRepositoryProvider>
      </MatchIntentRepositoryProvider>
    </AssetResolverProvider>
  );
}

function ApplicationAssetPreloader() {
  usePreloadAssetSurface('app-shell');
  return null;
}
