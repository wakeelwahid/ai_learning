import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { palette, semantic, typography } from "@/theme/colors";

export type BadgeVariant = "primary" | "success" | "warning" | "danger" | "info" | "gray";

interface Props {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  primary: { bg: palette.primary100, text: palette.primary700 },
  success: { bg: semantic.success.bg, text: semantic.success.text },
  warning: { bg: semantic.warning.bg, text: semantic.warning.text },
  danger:  { bg: semantic.danger.bg,  text: semantic.danger.text },
  info:    { bg: semantic.info.bg,    text: semantic.info.text },
  gray:    { bg: palette.gray100, text: palette.gray600 },
};

/** Pill badge — semantic variants only (status/feedback), never decorative. */
export default function Badge({ label, variant = "gray", style }: Props) {
  const c = VARIANT_COLORS[variant];
  return (
    <View style={[styles.base, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: typography.caption.fontSize,
    fontFamily: typography.bodyMedium.fontFamily,
    fontWeight: "700",
  },
});
