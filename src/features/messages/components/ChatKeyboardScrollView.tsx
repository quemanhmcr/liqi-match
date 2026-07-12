import {
  forwardRef,
  useCallback,
  type ElementRef,
  type MutableRefObject,
  type Ref,
} from 'react';
import { KeyboardChatScrollView } from 'react-native-keyboard-controller';
import type { ScrollViewProps } from 'react-native';

export type ChatKeyboardScrollViewRef = ElementRef<
  typeof KeyboardChatScrollView
>;

type ChatKeyboardScrollViewProps = ScrollViewProps & {
  bottomOffset: number;
  chatScrollViewRef: MutableRefObject<ChatKeyboardScrollViewRef | null>;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref) ref.current = value;
}

/**
 * FlatList scroll adapter with one native source of truth for IME movement.
 * The composer is a normal-flow sibling, so this adapter owns keyboard
 * displacement only and never synthesizes space for application UI.
 */
export const ChatKeyboardScrollView = forwardRef<
  ChatKeyboardScrollViewRef,
  ChatKeyboardScrollViewProps
>(({ bottomOffset, chatScrollViewRef, ...props }, forwardedRef) => {
  const combinedRef = useCallback(
    (instance: ChatKeyboardScrollViewRef | null) => {
      assignRef(forwardedRef, instance);
      chatScrollViewRef.current = instance;
    },
    [chatScrollViewRef, forwardedRef],
  );

  return (
    <KeyboardChatScrollView
      {...props}
      automaticallyAdjustContentInsets={false}
      automaticallyAdjustKeyboardInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardLiftBehavior="whenAtEnd"
      offset={bottomOffset}
      ref={combinedRef}
    />
  );
});

ChatKeyboardScrollView.displayName = 'ChatKeyboardScrollView';
