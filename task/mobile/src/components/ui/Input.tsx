import React, { useState } from "react";
import { View, TextInput, Text, StyleSheet, TextInputProps, ViewStyle } from "react-native";
import { palette, radius, typography } from "@/theme/colors";

export interface InputProps extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

/** Text input primitive with label, helper text, and error state. */
export default function Input({ label, helperText, error, containerStyle, style, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={palette.gray400}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: typography.bodyMedium.fontSize,
    fontFamily: typography.bodyMedium.fontFamily,
    fontWeight: "500",
    color: palette.gray700,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.gray200,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: typography.body.fontSize,
    fontFamily: typography.body.fontFamily,
    color: palette.gray900,
    backgroundColor: "#fff",
  },
  inputFocused: {
    borderColor: palette.primary500,
  },
  inputError: {
    borderColor: palette.danger500,
  },
  helperText: {
    marginTop: 6,
    fontSize: typography.bodySm.fontSize,
    fontFamily: typography.bodySm.fontFamily,
    color: palette.gray500,
  },
  errorText: {
    marginTop: 6,
    fontSize: typography.bodySm.fontSize,
    fontFamily: typography.bodySm.fontFamily,
    color: palette.danger600,
  },
});
