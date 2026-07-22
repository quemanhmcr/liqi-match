import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { AppText } from './AppText';
import { appColors, appOpacity } from './theme/app-theme';
import { sharedUiRecipes } from './internal/component-recipes';

export type AppTextFieldProps = Omit<TextInputProps, 'style'> &
  Readonly<{
    /** Layout overrides for the complete field, including label and messages. */
    containerStyle?: StyleProp<ViewStyle>;
    /** Validation copy; takes precedence over helperText. */
    errorText?: string;
    /** Non-error guidance displayed below the input. */
    helperText?: string;
    /** Typography and input-box overrides for the native TextInput only. */
    inputStyle?: StyleProp<TextStyle>;
    /** Visible field name. accessibilityLabel remains caller-owned. */
    label?: string;
    /** Optional leading visual or control inside the input shell. */
    leading?: ReactNode;
    /** Compact metadata such as a character counter or optional marker. */
    meta?: string;
    /** Optional trailing visual or control inside the input shell. */
    trailing?: ReactNode;
  }>;

/**
 * Conventional text form field with shared focus, disabled and validation UI.
 *
 * Value, validation rules and save semantics remain caller-owned. Use a
 * feature-owned component for rich composers, token editors or inputs whose
 * interaction model is more complex than a standard TextInput.
 */
export function AppTextField({
  containerStyle,
  editable = true,
  errorText,
  helperText,
  inputStyle,
  label,
  leading,
  meta,
  multiline,
  onBlur,
  onFocus,
  trailing,
  ...props
}: AppTextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, !editable && styles.disabled, containerStyle]}>
      {label || meta ? (
        <View style={styles.labelRow}>
          {label ? <AppText variant="label">{label}</AppText> : <View />}
          {meta ? (
            <AppText tone="muted" variant="caption">
              {meta}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.shell,
          multiline && styles.multilineShell,
          focused && styles.focused,
          errorText && styles.error,
        ]}
      >
        {leading ? <View style={styles.accessory}>{leading}</View> : null}
        <TextInput
          {...props}
          editable={editable}
          multiline={multiline}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={appColors.text.muted}
          style={[styles.input, multiline && styles.multilineInput, inputStyle]}
        />
        {trailing ? <View style={styles.accessory}>{trailing}</View> : null}
      </View>
      {errorText ? (
        <AppText tone="warning" variant="caption">
          {errorText}
        </AppText>
      ) : helperText ? (
        <AppText tone="muted" variant="caption">
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  accessory: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: appOpacity.disabled },
  error: { borderColor: appColors.status.warning },
  field: { gap: sharedUiRecipes.textField.gap },
  focused: { borderColor: appColors.border.focus },
  input: {
    color: appColors.text.primary,
    flex: 1,
    fontSize: sharedUiRecipes.textField.fontSize,
    fontWeight: sharedUiRecipes.textField.fontWeight,
    minHeight: sharedUiRecipes.textField.minimumHeight,
    paddingHorizontal: sharedUiRecipes.textField.paddingHorizontal,
    paddingVertical: sharedUiRecipes.textField.paddingVertical,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  multilineInput: {
    minHeight: sharedUiRecipes.textField.multilineMinimumHeight,
    paddingTop: sharedUiRecipes.textField.multilinePaddingTop,
    textAlignVertical: 'top',
  },
  multilineShell: { alignItems: 'flex-start' },
  shell: {
    alignItems: 'center',
    backgroundColor: sharedUiRecipes.textField.background,
    borderColor: sharedUiRecipes.textField.border,
    borderRadius: sharedUiRecipes.textField.radius,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
    paddingHorizontal: sharedUiRecipes.textField.accessoryPadding,
  },
});
