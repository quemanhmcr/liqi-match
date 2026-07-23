import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  AppIconButton,
  AppSurface,
  appColors,
  appRadii,
  appSpacing,
  appTypography,
} from '@/shared/ui';

import { messagesUi } from '../ui/messages-ui';

export type MessageInboxSearchHeaderProps = Readonly<{
  compact: boolean;
  onCancel: () => void;
  onChangeQuery: (query: string) => void;
  query: string;
}>;

/** Owns the focused search mode without competing with page-level header actions. */
export function MessageInboxSearchHeader({
  compact,
  onCancel,
  onChangeQuery,
  query,
}: MessageInboxSearchHeaderProps) {
  return (
    <View
      style={[styles.header, compact && styles.headerCompact]}
      testID="messages-search-header"
    >
      <AppIconButton
        accessibilityLabel="Đóng tìm kiếm"
        backgroundColor={appColors.background.elevatedStrong}
        borderColor={appColors.border.surfaceSoft}
        emphasis="none"
        onPress={onCancel}
        size={
          compact
            ? messagesUi.metrics.inbox.searchBackActionCompact
            : messagesUi.metrics.inbox.searchBackAction
        }
        surfaceTone="low"
        testID="messages-search-back-action"
        withHighlight={false}
      >
        <Ionicons
          color={appColors.icon.primary}
          name="arrow-back"
          size={compact ? 22 : 24}
        />
      </AppIconButton>

      <AppSurface
        backgroundColor={messagesUi.colors.composerInput}
        borderColor={messagesUi.colors.composerStroke}
        contentStyle={styles.searchBox}
        emphasis="none"
        radius={appRadii.pill}
        style={styles.searchShell}
        surfaceTone="high"
        testID="messages-search-surface"
        variant="nav"
        withHighlight={false}
        withShadow={false}
      >
        <Ionicons
          color={appColors.text.muted}
          name="search-outline"
          size={20}
        />
        <TextInput
          accessibilityLabel="Tìm kiếm cuộc trò chuyện"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={120}
          onChangeText={onChangeQuery}
          onSubmitEditing={Keyboard.dismiss}
          placeholder="Tìm người hoặc trò chuyện..."
          placeholderTextColor={appColors.text.muted}
          returnKeyType="search"
          style={styles.searchInput}
          testID="messages-search-input"
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Xoá tìm kiếm"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChangeQuery('')}
            testID="messages-search-clear-action"
          >
            <Ionicons
              color={appColors.text.tertiary}
              name="close-circle"
              size={20}
            />
          </Pressable>
        ) : null}
      </AppSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.lg,
    minHeight: messagesUi.metrics.inbox.searchHeaderMinHeight,
  },
  headerCompact: {
    gap: appSpacing.md,
    minHeight: messagesUi.metrics.inbox.searchHeaderMinHeightCompact,
  },
  searchBox: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: appSpacing.md,
    minHeight: messagesUi.metrics.inbox.searchHeight,
    paddingHorizontal: appSpacing.xl,
  },
  searchInput: {
    ...appTypography.body,
    color: appColors.text.primary,
    flex: 1,
    paddingVertical: 0,
  },
  searchShell: { flex: 1, minWidth: 0 },
});
