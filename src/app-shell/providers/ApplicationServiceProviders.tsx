import type { PropsWithChildren } from 'react';

import { HomeMatchFactsRepositoryProvider } from '@/entities/home-match-facts';
import { MatchDecisionRepositoryProvider } from '@/entities/match-decision';
import { MatchIntentRepositoryProvider } from '@/entities/match-intent';
import { MatchSetRepositoryProvider } from '@/entities/match-set';
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
      <HomeMatchFactsRepositoryProvider
        repository={services.homeMatchFactsRepository}
      >
        <MatchSetRepositoryProvider repository={services.matchSetRepository}>
          <MatchIntentRepositoryProvider
            repository={services.matchIntentRepository}
          >
            <MatchDecisionRepositoryProvider
              repository={services.matchDecisionRepository}
            >
              <DiscoverRepositoryProvider
                repository={services.discoverRepository}
              >
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
        </MatchSetRepositoryProvider>
      </HomeMatchFactsRepositoryProvider>
    </AssetResolverProvider>
  );
}

function ApplicationAssetPreloader() {
  usePreloadAssetSurface('app-shell');
  return null;
}
