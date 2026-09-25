import React from "react";
import { TouchableOpacity, ActivityIndicator, Text, StyleSheet, ViewStyle, TextStyle, GestureResponderEvent } from "react-native";
import { palette, radius, typography } from "@/theme/colors";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface Props {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const SIZE_PADDING: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 8, paddingHorizontal: 14, fontSize: 13 },
  md: { paddingVertical: 12, paddingHorizontal: 18, fontSize: typography.body.fontSize },
  lg: { paddingVertical: 15, paddingHorizontal: 22, fontSize: typography.bodyLg.fontSize },
};

/** Button primitive — variant: primary/secondary/ghost/danger, size: sm/md/lg. */
export default function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}: Props) {
  const isDisabled = disabled || isLoading;
  const sizeCfg = SIZE_PADDING[size];

  const variantStyle: ViewStyle =
    variant === "primary" ? { backgroundColor: palette.primary600 } :
    variant === "secondary" ? { backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray200 } :
    variant === "ghost" ? { backgroundColor: "transparent" } :
    { backgroundColor: palette.danger600 };

  const textColor =
    variant === "secondary" ? palette.gray700 :
    variant === "ghost" ? palette.gray700 :
    "#fff";

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        variantStyle,
        { paddingVertical: sizeCfg.paddingVertical, paddingHorizontal: sizeCfg.paddingHorizontal },
        fullWidth && { width: "100%" },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize: sizeCfg.fontSize }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  text: {
    fontFamily: typography.bodyMedium.fontFamily,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});
