import { Stack } from 'expo-router';

import { RouteAccessGate } from '@/app-shell/access/RouteAccessGate';

export default function OnboardingRoutesLayout() {
  return (
    <RouteAccessGate area="onboarding">
      <Stack screenOptions={{ headerShown: false }} />
    </RouteAccessGate>
  );
}
