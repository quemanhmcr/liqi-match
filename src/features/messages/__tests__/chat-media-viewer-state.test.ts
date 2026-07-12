import { describe, expect, it } from '@jest/globals';

import {
  resolveChatMediaViewerTap,
  shouldDismissChatMediaViewer,
} from '@/features/messages/model/chat-media-viewer-state';

describe('chat media viewer gesture state', () => {
  it('toggles between 1x and 2.5x on a double tap', () => {
    const zoomIn = resolveChatMediaViewerTap({
      currentScale: 1,
      lastTapAt: 1_000,
      now: 1_200,
    });
    expect(zoomIn).toEqual({
      isDoubleTap: true,
      nextLastTapAt: 0,
      nextScale: 2.5,
    });

    expect(
      resolveChatMediaViewerTap({
        currentScale: zoomIn.nextScale,
        lastTapAt: 2_000,
        now: 2_200,
      }).nextScale,
    ).toBe(1);
  });

  it('keeps a single tap as a controls toggle without changing zoom', () => {
    expect(
      resolveChatMediaViewerTap({
        currentScale: 1,
        lastTapAt: 0,
        now: 1_000,
      }),
    ).toEqual({
      isDoubleTap: false,
      nextLastTapAt: 1_000,
      nextScale: 1,
    });
  });

  it('dismisses only a one-finger downward swipe at 1x zoom', () => {
    expect(
      shouldDismissChatMediaViewer({
        deltaX: 10,
        deltaY: 130,
        touchCount: 1,
        zoomScale: 1,
      }),
    ).toBe(true);
    expect(
      shouldDismissChatMediaViewer({
        deltaX: 10,
        deltaY: 130,
        touchCount: 1,
        zoomScale: 2.5,
      }),
    ).toBe(false);
    expect(
      shouldDismissChatMediaViewer({
        deltaX: 10,
        deltaY: 130,
        touchCount: 2,
        zoomScale: 1,
      }),
    ).toBe(false);
  });
});
