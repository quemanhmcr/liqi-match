import { Stack } from 'expo-router';

import { RouteAccessGate } from '@/app-shell/access/RouteAccessGate';
import { OnboardingDraftBoundary } from '@/app-shell/access/OnboardingDraftBoundary';

export default function OnboardingRoutesLayout() {
  return (
    <RouteAccessGate area="onboarding">
      <OnboardingDraftBoundary>
        <Stack screenOptions={{ headerShown: false }} />
      </OnboardingDraftBoundary>
    </RouteAccessGate>
  );
}
