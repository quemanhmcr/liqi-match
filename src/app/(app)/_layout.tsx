import { Stack } from 'expo-router';

import { RouteAccessGate } from '@/app-shell/access/RouteAccessGate';

/** Authenticated application area; feature routes are discovered from files. */
export default function AuthenticatedRoutesLayout() {
  return (
    <RouteAccessGate area="app">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteAccessGate>
  );
}
