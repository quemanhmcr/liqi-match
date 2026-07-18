import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import {
  LiquidGlassSurface,
  LiquidOrbButton,
} from '@/shared/components/liquid';

import {
  clearChatDraft,
  flushChatDraft,
  loadChatDraft,
  scheduleChatDraftSave,
} from '../model/chat-draft-store';
import type { ChatMediaAttachment } from '../model/chat-message';
import { useChatRuntimeStore } from '../model/chat-runtime-store';
import type {
  MessageComposerAction,
  MessageConversationCapabilities,
} from '../contracts/messages-contracts';
import {
  MAX_CHAT_TEXT_LENGTH,
  normalizeChatText,
} from '../services/chat-message-transport';
import { lightImpact, selectionImpact } from './chat-conversation-haptics';
import { chatConversationStyles as styles } from './chat-conversation.styles';

type ComposerTray = 'attachments' | 'emoji';

const quickEmojis = ['💜', '✨', '🔥', '😂', '👊🏻', 'GG', '🎮', '😎'] as const;

export function ChatComposer({
  capabilities,
  conversationId,
  onFocus,
  onSend,
  placeholder,
}: {
  capabilities: MessageConversationCapabilities;
  conversationId: string;
  onFocus: () => void;
  onSend: (submission: {
    media?: ChatMediaAttachment;
    text: string;
  }) => boolean;
  placeholder: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const draft = useChatRuntimeStore(
    (state) => state.draftsByConversation[conversationId] ?? '',
  );
  const draftHydrated = useChatRuntimeStore(
    (state) => state.draftHydratedByConversation[conversationId],
  );
  const hydrateDraft = useChatRuntimeStore((state) => state.hydrateDraft);
  const setRuntimeDraft = useChatRuntimeStore((state) => state.setDraft);
  const clearRuntimeDraft = useChatRuntimeStore((state) => state.clearDraft);
  const [activeTray, setActiveTray] = useState<ComposerTray>();
  const [composerNotice, setComposerNotice] = useState<string>();
  const [selectedMedia, setSelectedMedia] = useState<ChatMediaAttachment>();
  const [selectedMediaPhase, setSelectedMediaPhase] = useState<
    'processing' | 'ready'
  >('ready');
  const mediaProcessingTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const trayTransitionRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [selection, setSelection] = useState(() => ({
    end: draft.length,
    start: draft.length,
  }));
  const didInitializeHydratedSelection = useRef(Boolean(draftHydrated));

  useEffect(() => {
    if (draftHydrated) return;
    let active = true;
    loadChatDraft(conversationId)
      .then((storedDraft) => {
        if (active) hydrateDraft(conversationId, storedDraft);
      })
      .catch(() => {
        if (active) hydrateDraft(conversationId, '');
      });
    return () => {
      active = false;
    };
  }, [conversationId, draftHydrated, hydrateDraft]);

  useEffect(() => {
    if (!draftHydrated || didInitializeHydratedSelection.current) return;
    didInitializeHydratedSelection.current = true;
    setSelection((current) => {
      if (current.start !== 0 || current.end !== 0) return current;
      const cursor = draft.length;
      return { end: cursor, start: cursor };
    });
  }, [draft, draftHydrated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void flushChatDraft(conversationId).catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
      void flushChatDraft(conversationId).catch(() => undefined);
    };
  }, [conversationId]);

  useEffect(() => {
    return () => {
      trayTransitionRef.current += 1;
      if (mediaProcessingTimerRef.current) {
        clearTimeout(mediaProcessingTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (focusRequest === 0 || activeTray !== undefined) return;
    inputRef.current?.focus();
  }, [activeTray, focusRequest]);

  const updateDraft = (nextDraft: string) => {
    setRuntimeDraft(conversationId, nextDraft);
    scheduleChatDraftSave(conversationId, nextDraft);
  };

  const openTray = (tray: ComposerTray) => {
    selectionImpact();
    setComposerNotice(undefined);

    const transition = trayTransitionRef.current + 1;
    trayTransitionRef.current = transition;
    if (activeTray === tray) {
      setActiveTray(undefined);
      return;
    }

    inputRef.current?.blur();
    void KeyboardController.dismiss({ animated: true, keepFocus: false })
      .catch(() => undefined)
      .then(() => {
        if (trayTransitionRef.current !== transition) return;
        setActiveTray(tray);
      });
  };

  const closeTrayAndFocusInput = () => {
    const transition = trayTransitionRef.current + 1;
    trayTransitionRef.current = transition;
    setActiveTray(undefined);
    setFocusRequest(transition);
  };

  const insertEmoji = (emoji: string) => {
    const start = Math.min(selection.start, draft.length);
    const end = Math.min(selection.end, draft.length);
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const cursor = start + emoji.length;
    updateDraft(nextDraft);
    setSelection({ end: cursor, start: cursor });
    selectionImpact();
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => setSelection(event.nativeEvent.selection);

  const chooseMedia = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setComposerNotice('Cần quyền camera để chụp ảnh.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images', 'videos'],
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsMultipleSelection: false,
              mediaTypes: ['images', 'videos'],
              quality: 0.85,
            });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if (mediaProcessingTimerRef.current) {
        clearTimeout(mediaProcessingTimerRef.current);
      }
      setSelectedMedia({
        durationMs: asset.duration ?? undefined,
        fileName: asset.fileName ?? undefined,
        fileSize: asset.fileSize ?? undefined,
        height: asset.height,
        mediaType: asset.type === 'video' ? 'video' : 'image',
        mimeType: asset.mimeType ?? undefined,
        thumbnailUri: asset.type === 'image' ? asset.uri : undefined,
        uri: asset.uri,
        width: asset.width,
      });
      setSelectedMediaPhase('processing');
      setComposerNotice(
        asset.type === 'video' ? 'Đang xử lý video…' : 'Đang xử lý ảnh…',
      );
      setActiveTray(undefined);
      mediaProcessingTimerRef.current = setTimeout(() => {
        setSelectedMediaPhase('ready');
        setComposerNotice(
          asset.type === 'video'
            ? 'Video đã sẵn sàng gửi.'
            : 'Ảnh đã sẵn sàng gửi.',
        );
        mediaProcessingTimerRef.current = undefined;
      }, 320);
    } catch {
      setComposerNotice('Không thể mở trình chọn media lúc này.');
    }
  };

  const send = () => {
    if (!normalizeChatText(draft) && !selectedMedia) return;
    if (selectedMedia && selectedMediaPhase !== 'ready') return;
    if (!onSend({ media: selectedMedia, text: draft })) return;

    lightImpact();
    clearRuntimeDraft(conversationId);
    setSelection({ end: 0, start: 0 });
    setActiveTray(undefined);
    setComposerNotice(undefined);
    setSelectedMedia(undefined);
    setSelectedMediaPhase('ready');
    void clearChatDraft(conversationId).catch(() => undefined);
  };
  const composerActionStates = new Map(
    capabilities.composerActions.map((action) => [action.id, action.state]),
  );
  const actionState = (id: MessageComposerAction['id']) =>
    composerActionStates.get(id) ?? 'hidden';
  const attachmentActionIds: readonly MessageComposerAction['id'][] = [
    'image',
    'camera',
  ];
  const hasVisibleAttachmentAction = attachmentActionIds.some(
    (id) => actionState(id) === 'available',
  );
  const canSend =
    (normalizeChatText(draft).length > 0 || Boolean(selectedMedia)) &&
    (!selectedMedia || selectedMediaPhase === 'ready');

  return (
    <View testID="chat-composer-content">
      {activeTray || composerNotice || selectedMedia ? (
        <View style={styles.composerUtilityArea}>
          {selectedMedia ? (
            <View
              accessibilityLabel={`Media đã chọn: ${
                selectedMedia.mediaType === 'video' ? 'video' : 'ảnh'
              }`}
              accessible
              style={styles.selectedMediaRow}
            >
              <View style={styles.selectedMediaPreviewWrap}>
                {selectedMedia.mediaType === 'image' ? (
                  <Image
                    source={{ uri: selectedMedia.uri }}
                    style={styles.selectedMediaImage}
                  />
                ) : (
                  <View style={styles.selectedMediaVideoIcon}>
                    <Ionicons
                      color="rgba(223,232,255,0.78)"
                      name="videocam"
                      size={18}
                    />
                  </View>
                )}
                {selectedMediaPhase === 'processing' ? (
                  <View style={styles.selectedMediaProcessingOverlay}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  </View>
                ) : null}
              </View>
              <View style={styles.selectedMediaCopy}>
                <Text numberOfLines={1} style={styles.selectedMediaText}>
                  {selectedMedia.fileName ??
                    (selectedMedia.mediaType === 'video'
                      ? 'Video đã chọn'
                      : 'Ảnh đã chọn')}
                </Text>
                <Text style={styles.selectedMediaStatus}>
                  {selectedMediaPhase === 'processing'
                    ? 'Đang xử lý…'
                    : `${selectedMedia.width ?? '?'} × ${selectedMedia.height ?? '?'}`}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Bỏ media đã chọn"
                hitSlop={8}
                onPress={() => {
                  if (mediaProcessingTimerRef.current) {
                    clearTimeout(mediaProcessingTimerRef.current);
                    mediaProcessingTimerRef.current = undefined;
                  }
                  setSelectedMedia(undefined);
                  setSelectedMediaPhase('ready');
                  setComposerNotice(undefined);
                }}
              >
                <Ionicons
                  color="rgba(223,232,255,0.58)"
                  name="close"
                  size={18}
                />
              </Pressable>
            </View>
          ) : null}
          {activeTray === 'attachments' ? (
            <View
              accessibilityLabel="Tuỳ chọn đính kèm"
              style={styles.actionTray}
            >
              {actionState('image') === 'available' ? (
                <ComposerAction
                  icon="images-outline"
                  label="Ảnh/video"
                  onPress={() => void chooseMedia('library')}
                />
              ) : null}
              {actionState('camera') === 'available' ? (
                <ComposerAction
                  icon="camera-outline"
                  label="Camera"
                  onPress={() => void chooseMedia('camera')}
                />
              ) : null}
            </View>
          ) : null}
          {activeTray === 'emoji' ? (
            <View accessibilityLabel="Biểu cảm nhanh" style={styles.emojiTray}>
              {quickEmojis.map((emoji) => (
                <Pressable
                  accessibilityLabel={`Chèn ${emoji}`}
                  key={emoji}
                  onPress={() => insertEmoji(emoji)}
                  style={({ pressed }) => [
                    styles.emojiAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emojiActionText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {composerNotice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.composerNotice}
            >
              {composerNotice}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.composerRow}>
        {hasVisibleAttachmentAction ? (
          <LiquidOrbButton
            accessibilityLabel="Thêm nội dung"
            glassIntensity="low"
            glowIntensity="none"
            onPress={() => openTray('attachments')}
            size={36}
          >
            <Ionicons
              color="rgba(214,222,244,0.60)"
              name={activeTray === 'attachments' ? 'close' : 'add'}
              size={19}
            />
          </LiquidOrbButton>
        ) : null}

        <LiquidGlassSurface
          baseStrokeOpacity={0.05}
          baseStrokeWidth={0.5}
          blurIntensity={20}
          contentStyle={styles.inputSurface}
          glowIntensity="none"
          radius={21}
          style={styles.inputShell}
          surfaceBackground="rgba(9,14,29,0.72)"
          variant="nav"
          withInnerReflection={false}
          withShadow={false}
        >
          <View style={styles.inputTextSlot}>
            <TextInput
              accessibilityHint="Nhấn nút gửi để gửi. Phím Enter tạo dòng mới."
              accessibilityLabel="Nội dung tin nhắn"
              blurOnSubmit={false}
              keyboardAppearance="dark"
              maxLength={MAX_CHAT_TEXT_LENGTH}
              multiline
              onChangeText={updateDraft}
              onBlur={() => {
                void flushChatDraft(conversationId).catch(() => undefined);
              }}
              onFocus={onFocus}
              onSelectionChange={handleSelectionChange}
              placeholder={placeholder}
              placeholderTextColor="rgba(190,201,229,0.52)"
              ref={inputRef}
              scrollEnabled
              testID="chat-composer-input"
              selection={selection}
              style={styles.input}
              value={draft}
            />
            {activeTray ? (
              <Pressable
                accessibilityLabel="Tiếp tục nhập tin nhắn"
                accessibilityRole="button"
                onPress={closeTrayAndFocusInput}
                style={styles.inputFocusHandoff}
                testID="chat-composer-focus-handoff"
              />
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="Chọn biểu cảm"
            accessibilityRole="button"
            accessibilityState={{ expanded: activeTray === 'emoji' }}
            hitSlop={8}
            onPress={() => openTray('emoji')}
          >
            <Ionicons
              color="rgba(205,216,243,0.64)"
              name={activeTray === 'emoji' ? 'close-circle' : 'happy-outline'}
              size={21}
            />
          </Pressable>
        </LiquidGlassSurface>

        <Pressable
          accessibilityLabel="Gửi tin nhắn"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
        >
          <LinearGradient
            colors={['rgba(157,77,255,0.98)', 'rgba(57,120,220,0.94)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons color="#FFFFFF" name="paper-plane" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

function ComposerAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.composerAction,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.composerActionIcon}>
        <Ionicons color="rgba(214,226,255,0.76)" name={icon} size={18} />
      </View>
      <Text numberOfLines={1} style={styles.composerActionText}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ReadOnlyComposer({ reason }: { reason?: string }) {
  return (
    <View
      accessibilityLabel="Thông báo này không hỗ trợ trả lời"
      accessible
      style={styles.readOnlyComposer}
    >
      <Ionicons
        color="rgba(201,211,238,0.52)"
        name="lock-closed-outline"
        size={17}
      />
      <Text style={styles.readOnlyComposerText}>
        {reason ?? 'Cuộc trò chuyện này không hỗ trợ trả lời'}
      </Text>
    </View>
  );
}
