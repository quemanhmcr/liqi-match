import { DiscoverCollectionScreen } from '../components/DiscoverCollectionScreen';
import { DiscoverMatchIntentGate } from '../components/DiscoverMatchIntentGate';

export function DiscoverMatchesScreen() {
  return (
    <DiscoverMatchIntentGate>
      <DiscoverCollectionScreen kind="matches" />
    </DiscoverMatchIntentGate>
  );
}
