import { describe, expect, it } from '@jest/globals';

import { calculateChatMediaPreviewMetrics } from '@/features/messages/model/chat-media-layout';

describe('chat media preview layout', () => {
  it('reserves a square preview within chat viewport limits', () => {
    expect(
      calculateChatMediaPreviewMetrics({
        mediaHeight: 1200,
        mediaWidth: 1200,
        viewportHeight: 844,
        viewportWidth: 390,
      }),
    ).toEqual({
      height: 282,
      isCropped: false,
      resizeMode: 'contain',
      width: 282,
    });
  });

  it('caps a portrait preview height and crops without changing row size later', () => {
    const metrics = calculateChatMediaPreviewMetrics({
      mediaHeight: 2400,
      mediaWidth: 800,
      viewportHeight: 800,
      viewportWidth: 390,
    });

    expect(metrics.width).toBe(282);
    expect(metrics.height).toBe(320);
    expect(metrics.isCropped).toBe(true);
    expect(metrics.resizeMode).toBe('cover');
  });

  it('uses a stable fallback ratio when picker metadata is absent', () => {
    expect(
      calculateChatMediaPreviewMetrics({
        viewportHeight: 800,
        viewportWidth: 360,
      }),
    ).toEqual({
      height: 194,
      isCropped: false,
      resizeMode: 'contain',
      width: 259,
    });
  });
});
