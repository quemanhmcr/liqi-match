import { useMemo, type PropsWithChildren } from 'react';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveChatKeyboardGeometry } from '../model/chat-keyboard-ownership';

type ChatComposerDockProps = PropsWithChildren<{
  bottomInset: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * The only visual owner of the bottom edge. Closed: the content includes the
 * safe-area padding. Open: that padding is allowed to sit behind the IME while
 * the interactive controls remain flush with the keyboard top.
 */
export function ChatComposerDock({
  bottomInset,
  children,
  style,
}: ChatComposerDockProps) {
  const geometry = resolveChatKeyboardGeometry(bottomInset);
  const contentStyle = useMemo(
    () => [styles.content, { paddingBottom: geometry.bottomInset }, style],
    [geometry.bottomInset, style],
  );

  return (
    <KeyboardStickyView
      offset={geometry.stickyOffset}
      pointerEvents="box-none"
      style={styles.dock}
      testID="chat-composer-dock"
    >
      <View style={contentStyle} testID="chat-composer-dock-content">
        {children}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: 'rgba(3,7,17,0.98)',
    borderTopColor: 'rgba(210,224,255,0.055)',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dock: {
    flexShrink: 0,
    zIndex: 20,
  },
});
