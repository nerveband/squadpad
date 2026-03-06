import { useState } from 'react';
import { TextInput as RNTextInput, StyleSheet, TextInputProps, View } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize } from '../theme/typography';
import { Radius } from '../theme/spacing';

interface StyledTextInputProps extends TextInputProps {
  // Extends all RN TextInput props
}

export function StyledTextInput(props: StyledTextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, focused && styles.wrapperFocused]}>
      <RNTextInput
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
        style={[styles.input, props.style]}
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
  input: {
    color: Colors.text,
    fontSize: FontSize.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
