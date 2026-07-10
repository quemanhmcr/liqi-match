import { RouteAccessGate } from '@/app-shell/access/RouteAccessGate';
import LoginScreen from '@/features/auth/screens/LoginScreen';

/** Root remains a thin adapter because Expo Router reserves this file for /. */
export default function LoginRoute() {
  return (
    <RouteAccessGate area="public">
      <LoginScreen />
    </RouteAccessGate>
  );
}
