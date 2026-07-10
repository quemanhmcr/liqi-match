import { Redirect, Slot } from 'expo-router';

import { appRoutes } from '@/app-shell/navigation/routes';

export default function DevRoutesLayout() {
  if (!__DEV__) return <Redirect href={appRoutes.main.home} />;
  return <Slot />;
}
