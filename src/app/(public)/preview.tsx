import HomeDashboardScreen from '@/features/home/screens/HomeDashboardScreen';

/** Public, intentionally read-only preview. Authenticated Home stays at /home. */
export default function HomePreviewRoute() {
  return <HomeDashboardScreen />;
}
