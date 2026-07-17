import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChatMediaViewer } from '../components/ChatMediaViewer';

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockVideoSource: { current: string | null } = { current: null };

jest.mock('expo-video', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useVideoPlayer: (source: string | null) => {
      mockVideoSource.current = source;
      return { pause: mockPause, play: mockPlay };
    },
    VideoView: (props: Record<string, unknown>) =>
      React.createElement(View, props as never),
  };
});

const metrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

beforeEach(() => {
  mockPause.mockClear();
  mockPlay.mockClear();
  mockVideoSource.current = null;
});

describe('ChatMediaViewer video playback', () => {
  it('uses Expo Video native controls and pauses when hidden', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ChatMediaViewer
          attachment={{
            altText: 'Video chiến thắng',
            mediaType: 'video',
            mimeType: 'video/mp4',
            uri: 'file:///video.mp4',
          }}
          createdAt="2026-07-14T12:00:00.000Z"
          onClose={jest.fn()}
          visible
        />
      </SafeAreaProvider>,
    );

    const video = screen.getByTestId('chat-video-player');
    expect(video.props.accessibilityLabel).toBe('Video chiến thắng');
    expect(video.props.contentFit).toBe('contain');
    expect(video.props.nativeControls).toBe(true);
    expect(mockVideoSource.current).toBe('file:///video.mp4');
    await waitFor(() => expect(mockPlay).toHaveBeenCalled());

    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ChatMediaViewer
          attachment={{
            altText: 'Video chiến thắng',
            mediaType: 'video',
            mimeType: 'video/mp4',
            uri: 'file:///video.mp4',
          }}
          createdAt="2026-07-14T12:00:00.000Z"
          onClose={jest.fn()}
          visible={false}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(mockPause).toHaveBeenCalled());
  });
});
