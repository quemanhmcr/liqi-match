export const CHAT_MEDIA_DOUBLE_TAP_WINDOW_MS = 280;
export const CHAT_MEDIA_DOUBLE_TAP_ZOOM_SCALE = 2.5;
export const CHAT_MEDIA_SWIPE_DISMISS_DISTANCE_PX = 110;

export function resolveChatMediaViewerTap({
  currentScale,
  lastTapAt,
  now,
}: {
  currentScale: number;
  lastTapAt: number;
  now: number;
}) {
  const isDoubleTap =
    lastTapAt > 0 && now - lastTapAt < CHAT_MEDIA_DOUBLE_TAP_WINDOW_MS;
  return {
    isDoubleTap,
    nextLastTapAt: isDoubleTap ? 0 : now,
    nextScale: isDoubleTap
      ? currentScale > 1
        ? 1
        : CHAT_MEDIA_DOUBLE_TAP_ZOOM_SCALE
      : currentScale,
  };
}

export function shouldDismissChatMediaViewer({
  deltaX,
  deltaY,
  touchCount,
  zoomScale,
}: {
  deltaX: number;
  deltaY: number;
  touchCount: number;
  zoomScale: number;
}) {
  return (
    touchCount === 1 &&
    zoomScale === 1 &&
    deltaY > CHAT_MEDIA_SWIPE_DISMISS_DISTANCE_PX &&
    Math.abs(deltaX) < 80
  );
}
