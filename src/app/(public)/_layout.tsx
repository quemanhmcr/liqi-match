import { Stack } from 'expo-router';

import { RouteAccessGate } from '@/app-shell/access/RouteAccessGate';

export default function PublicRoutesLayout() {
  return (
    <RouteAccessGate area="public">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteAccessGate>
  );
}
