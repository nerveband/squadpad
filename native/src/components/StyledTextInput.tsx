import { useState, type ComponentRef, type Ref } from 'react';
import { TextInput as RNTextInput, StyleSheet, TextInputProps, View } from 'react-native';
import { Colors } from '../theme/colors';
import { Fonts, FontSize } from '../theme/typography';
import { Radius } from '../theme/spacing';

interface StyledTextInputProps extends TextInputProps {
  /** Use Ioskeley Mono for technical fields like IP addresses. */
  mono?: boolean;
  /** Highlight input border in red when a required field is missing. */
  error?: boolean;
  inputRef?: Ref<ComponentRef<typeof RNTextInput>>;
}

export function StyledTextInput({ mono, error, inputRef, style, ...props }: StyledTextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrapper,
        focused && styles.wrapperFocused,
        error && styles.wrapperError,
      ]}
    >
      <RNTextInput
        ref={inputRef}
        {...props}
        placeholderTextColor={Colors.textDim}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, mono && styles.inputMono, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.white05,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  wrapperFocused: {
    borderColor: Colors.purple,
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  wrapperError: {
    borderColor: Colors.danger,
  },
  input: {
    fontFamily: Fonts.semibold,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  inputMono: {
    fontFamily: Fonts.mono,
  },
});
