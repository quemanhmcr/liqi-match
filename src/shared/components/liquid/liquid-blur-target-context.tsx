import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';

const LiquidBlurTargetContext = createContext<
  RefObject<View | null> | undefined
>(undefined);
const LiquidReducedGlassContext = createContext(false);

export const LiquidBlurTargetProvider = LiquidBlurTargetContext.Provider;
export const LiquidReducedGlassProvider = LiquidReducedGlassContext.Provider;

export function useLiquidBlurTarget() {
  return useContext(LiquidBlurTargetContext);
}

export function useLiquidReducedGlass() {
  return useContext(LiquidReducedGlassContext);
}
