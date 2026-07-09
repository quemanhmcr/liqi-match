import { Text as RNText, type TextProps } from 'react-native';

export function ProfileText(props: TextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}
