import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ChatMediaAttachment } from '../model/chat-message';
import {
  resolveChatMediaViewerTap,
  shouldDismissChatMediaViewer,
} from '../model/chat-media-viewer-state';
import { formatChatTimelineLabel } from '../model/chat-timeline';

export function ChatMediaViewer({
  attachment,
  caption,
  createdAt,
  onClose,
  visible,
}: {
  attachment: ChatMediaAttachment;
  caption?: string;
  createdAt: string;
  onClose: () => void;
  visible: boolean;
}) {
  const viewport = useWindowDimensions();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [lastTapAt, setLastTapAt] = useState(0);
  const [notice, setNotice] = useState<string>();
  const [touchStart, setTouchStart] = useState<{
    touchCount: number;
    x: number;
    y: number;
  }>();
  const [zoomScale, setZoomScale] = useState(1);

  const handleMediaTap = () => {
    const result = resolveChatMediaViewerTap({
      currentScale: zoomScale,
      lastTapAt,
      now: Date.now(),
    });
    setLastTapAt(result.nextLastTapAt);
    if (result.isDoubleTap) {
      setZoomScale(result.nextScale);
      return;
    }
    setControlsVisible((current) => !current);
  };

  const share = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setNotice('Thiết bị này không hỗ trợ chia sẻ file.');
        return;
      }
      await Sharing.shareAsync(attachment.uri, {
        dialogTitle: caption || 'Chia sẻ media',
        mimeType: attachment.mimeType,
      });
    } catch {
      setNotice('Không thể mở bảng chia sẻ lúc này.');
    }
  };

  const save = async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        setNotice('Cần quyền lưu media vào thư viện.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(attachment.uri);
      setNotice('Đã lưu vào thư viện.');
    } catch {
      setNotice('Không thể lưu media này.');
    }
  };

  const mediaLabel =
    attachment.mediaType === 'video'
      ? 'Video toàn màn hình'
      : 'Ảnh toàn màn hình';
  const timestamp = formatChatTimelineLabel(createdAt);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.root} testID="chat-media-viewer">
        <View
          onTouchEnd={(event) => {
            if (!touchStart) return;
            if (touchStart.touchCount > 1) {
              setTouchStart(undefined);
              return;
            }
            const deltaX = event.nativeEvent.pageX - touchStart.x;
            const deltaY = event.nativeEvent.pageY - touchStart.y;
            if (
              shouldDismissChatMediaViewer({
                deltaX,
                deltaY,
                touchCount: touchStart.touchCount,
                zoomScale,
              })
            ) {
              onClose();
            } else if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
              handleMediaTap();
            }
            setTouchStart(undefined);
          }}
          onTouchStart={(event) =>
            setTouchStart({
              touchCount: event.nativeEvent.touches.length,
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
            })
          }
          style={styles.gestureSurface}
          testID="chat-media-gesture-surface"
        >
          <ScrollView
            centerContent
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            onScroll={(event) => {
              const nextScale = event.nativeEvent.zoomScale ?? 1;
              if (Math.abs(nextScale - zoomScale) > 0.02) {
                setZoomScale(nextScale);
              }
            }}
            pinchGestureEnabled
            scrollEventThrottle={32}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={styles.zoomScroller}
            testID="chat-media-zoom-scroller"
            zoomScale={zoomScale}
          >
            {attachment.mediaType === 'image' ? (
              <Image
                accessibilityLabel={attachment.altText || mediaLabel}
                fadeDuration={120}
                onError={() => setImageLoading(false)}
                onLoadEnd={() => setImageLoading(false)}
                onLoadStart={() => setImageLoading(true)}
                resizeMode="contain"
                source={{ uri: attachment.uri }}
                style={{ height: viewport.height, width: viewport.width }}
              />
            ) : (
              <View
                style={[
                  styles.videoPlaceholder,
                  { height: viewport.height, width: viewport.width },
                ]}
              >
                <Ionicons color="#FFFFFF" name="play-circle" size={58} />
                <Text style={styles.videoPlaceholderText}>Video preview</Text>
              </View>
            )}
          </ScrollView>
          {imageLoading && attachment.mediaType === 'image' ? (
            <View pointerEvents="none" style={styles.loadingOverlay}>
              <ActivityIndicator color="rgba(255,255,255,0.74)" size="small" />
            </View>
          ) : null}
        </View>

        {controlsVisible ? (
          <>
            <SafeAreaView edges={['top']} style={styles.topControls}>
              <Pressable
                accessibilityLabel="Đóng trình xem media"
                accessibilityRole="button"
                hitSlop={10}
                onPress={onClose}
                style={styles.controlButton}
              >
                <Ionicons color="#FFFFFF" name="close" size={22} />
              </Pressable>
              <View style={styles.topActions}>
                <Pressable
                  accessibilityLabel="Chia sẻ media"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => void share()}
                  style={styles.controlButton}
                >
                  <Ionicons color="#FFFFFF" name="share-outline" size={20} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Lưu media"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => void save()}
                  style={styles.controlButton}
                >
                  <Ionicons color="#FFFFFF" name="download-outline" size={20} />
                </Pressable>
              </View>
            </SafeAreaView>
            <SafeAreaView edges={['bottom']} style={styles.bottomControls}>
              {caption ? <Text style={styles.caption}>{caption}</Text> : null}
              {timestamp ? (
                <Text style={styles.timestamp}>{timestamp}</Text>
              ) : null}
              {notice ? (
                <Text accessibilityLiveRegion="polite" style={styles.notice}>
                  {notice}
                </Text>
              ) : null}
              <Text style={styles.hint}>
                Chạm hai lần để thu phóng · Vuốt xuống để đóng
              </Text>
            </SafeAreaView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bottomControls: {
    backgroundColor: 'rgba(0,0,0,0.64)',
    bottom: 0,
    gap: 5,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    position: 'absolute',
    right: 0,
  },
  caption: { color: '#FFFFFF', fontSize: 15.5, lineHeight: 21 },
  controlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,16,18,0.58)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  gestureSurface: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  hint: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 10.5,
    marginTop: 3,
    textAlign: 'center',
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  notice: {
    color: 'rgba(194,218,255,0.84)',
    fontSize: 11,
    fontWeight: '600',
  },
  root: { backgroundColor: '#000000', flex: 1 },
  timestamp: { color: 'rgba(255,255,255,0.54)', fontSize: 11 },
  topActions: { flexDirection: 'row', gap: 9 },
  topControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 4,
  },
  videoPlaceholder: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  videoPlaceholderText: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 13,
    fontWeight: '600',
  },
  zoomContent: { alignItems: 'center', justifyContent: 'center' },
  zoomScroller: { flex: 1 },
});
