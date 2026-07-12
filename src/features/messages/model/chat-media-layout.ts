export const CHAT_MEDIA_MAX_WIDTH_DP = 340;
export const CHAT_MEDIA_MIN_WIDTH_DP = 196;
export const CHAT_MEDIA_MAX_VIEWPORT_WIDTH_RATIO = 0.78;
export const CHAT_MEDIA_MAX_VIEWPORT_HEIGHT_RATIO = 0.4;
export const CHAT_MEDIA_MIN_PREVIEW_HEIGHT_DP = 128;

export type ChatMediaPreviewMetrics = {
  height: number;
  isCropped: boolean;
  resizeMode: 'contain' | 'cover';
  width: number;
};

function positiveOrFallback(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function calculateChatMediaPreviewMetrics({
  mediaHeight,
  mediaWidth,
  viewportHeight,
  viewportWidth,
}: {
  mediaHeight?: number;
  mediaWidth?: number;
  viewportHeight: number;
  viewportWidth: number;
}): ChatMediaPreviewMetrics {
  const safeViewportWidth = positiveOrFallback(viewportWidth, 390);
  const safeViewportHeight = positiveOrFallback(viewportHeight, 844);
  const sourceWidth = positiveOrFallback(mediaWidth, 4);
  const sourceHeight = positiveOrFallback(mediaHeight, 3);
  const aspectRatio = sourceWidth / sourceHeight;
  const availableWidth = Math.max(0, safeViewportWidth - 28);
  const width = Math.max(
    Math.min(CHAT_MEDIA_MIN_WIDTH_DP, availableWidth),
    Math.min(
      CHAT_MEDIA_MAX_WIDTH_DP,
      availableWidth * CHAT_MEDIA_MAX_VIEWPORT_WIDTH_RATIO,
    ),
  );
  const maxHeight = Math.max(
    CHAT_MEDIA_MIN_PREVIEW_HEIGHT_DP,
    Math.min(360, safeViewportHeight * CHAT_MEDIA_MAX_VIEWPORT_HEIGHT_RATIO),
  );
  const naturalHeight = width / aspectRatio;
  const isTooTall = naturalHeight > maxHeight;
  const isExtremelyWide = aspectRatio > 2.5;
  const height = isTooTall
    ? maxHeight
    : isExtremelyWide
      ? Math.max(CHAT_MEDIA_MIN_PREVIEW_HEIGHT_DP, naturalHeight)
      : naturalHeight;

  return {
    height: Math.round(height),
    isCropped: isTooTall || isExtremelyWide,
    resizeMode: isTooTall || isExtremelyWide ? 'cover' : 'contain',
    width: Math.round(width),
  };
}
