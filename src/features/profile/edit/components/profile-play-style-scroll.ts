import type { ScrollView, View } from 'react-native';

import { appSpacing } from '@/shared/ui';

type ProfileEditNativeMeasureTarget = Exclude<
  Parameters<View['measureLayout']>[0],
  number
>;

export type ProfileEditScrollContainer = Readonly<{
  /**
   * RN 0.85 exposes this at runtime and documents it as an element-node API,
   * while its public TypeScript ScrollView declaration still omits the method.
   */
  getInnerViewRef?: () => ProfileEditNativeMeasureTarget | null;
  scrollTo: ScrollView['scrollTo'];
}>;
export type ProfileEditScrollAnchor = Pick<View, 'measureLayout'>;

/**
 * Scrolls the Profile Edit screen to a measured semantic anchor.
 *
 * The target position is measured against the ScrollView's native content
 * element instead of a legacy node handle or fixed offsets, so copy, font scale
 * and viewport changes do not make the destination drift. The small top inset
 * keeps the destination heading in view after the animated scroll completes.
 */
export function scrollToProfilePlayStyleAnchor(
  scrollView: ProfileEditScrollContainer | null,
  anchor: ProfileEditScrollAnchor | null,
) {
  if (
    !scrollView ||
    !anchor ||
    typeof scrollView.getInnerViewRef !== 'function' ||
    typeof scrollView.scrollTo !== 'function' ||
    typeof anchor.measureLayout !== 'function'
  ) {
    return false;
  }

  const contentRef = scrollView.getInnerViewRef();
  if (!contentRef) return false;

  anchor.measureLayout(
    contentRef,
    (_x, y) => {
      scrollView.scrollTo({
        animated: true,
        y: Math.max(0, y - appSpacing['4xl']),
      });
    },
    () => undefined,
  );
  return true;
}
