import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/shared/ui';

export type ResetProductRouteId =
  | 'discover-match-detail'
  | 'discover-matches'
  | 'discover-set-detail'
  | 'discover-sets'
  | 'discover-vibes'
  | 'explore'
  | 'profile'
  | 'profile-blocked'
  | 'profile-edit'
  | 'profile-engagement'
  | 'profile-gallery'
  | 'profile-player'
  | 'profile-player-reputation'
  | 'profile-reputation'
  | 'profile-settings'
  | 'profile-share'
  | 'session-create'
  | 'session-detail'
  | 'session-feedback'
  | 'sessions'
  | 'set-create'
  | 'set-edit'
  | 'sets'
  | 'social';

/**
 * Intentionally blank host for authenticated product routes awaiting rebuild.
 * URLs and access policy remain stable; no legacy feature UI is mounted.
 */
export function ResetRouteScreen({
  routeId,
}: Readonly<{ routeId: ResetProductRouteId }>) {
  return (
    <AppScreen
      contentContainerStyle={styles.content}
      scroll={false}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View
        accessibilityLabel={`Route ${routeId} đã được reset để xây lại`}
        accessible
        style={styles.blank}
        testID={`reset-route-${routeId}`}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 0, paddingTop: 0 },
});
