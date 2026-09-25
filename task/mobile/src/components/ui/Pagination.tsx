import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, typography } from "@/theme/colors";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional "X–Y of Z" summary text rendered to the left. */
  summary?: string;
}

/** Prev/next pagination primitive — zero-indexed `page`. RN equivalent of
 * the web/admin Pagination.tsx primitive, same props and behavior. */
export default function Pagination({ page, totalPages, onPageChange, summary }: Props) {
  if (totalPages <= 1) return null;

  return (
    <View style={styles.wrap}>
      {!!summary && <Text style={styles.summary}>{summary}</Text>}
      <View style={styles.buttons}>
        <TouchableOpacity
          onPress={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          style={[styles.btn, page === 0 && styles.btnDisabled]}
          accessibilityLabel="Previous page"
        >
          <Ionicons name="chevron-back" size={16} color={page === 0 ? palette.gray300 : palette.gray600} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page === totalPages - 1}
          style={[styles.btn, page === totalPages - 1 && styles.btnDisabled]}
          accessibilityLabel="Next page"
        >
          <Ionicons name="chevron-forward" size={16} color={page === totalPages - 1 ? palette.gray300 : palette.gray600} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  summary: {
    fontSize: typography.caption.fontSize,
    color: palette.gray500,
    flexShrink: 1,
  },
  buttons: { flexDirection: "row", gap: 4 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.gray100,
  },
  btnDisabled: { opacity: 0.5 },
});
