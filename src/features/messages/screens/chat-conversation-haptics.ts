import * as Haptics from 'expo-haptics';

export function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function lightImpact() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}
