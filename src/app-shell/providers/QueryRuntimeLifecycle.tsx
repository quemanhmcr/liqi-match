import { focusManager } from '@tanstack/react-query';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function QueryRuntimeLifecycle({ children }: PropsWithChildren) {
  useEffect(() => {
    const updateFocus = (state: AppStateStatus) => {
      focusManager.setFocused(state === 'active');
    };
    if (AppState.currentState) updateFocus(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateFocus);
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  return children;
}
