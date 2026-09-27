import React from "react";
import { Modal as RNModal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, cardShadowElevated, typography } from "@/theme/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Generic modal/bottom-sheet-style dialog primitive for arbitrary content —
 * a centered card over a dim backdrop, matching web's Modal primitive.
 * For a confirm/alert-replacement dialog, prefer the existing
 * `components/ui/ConfirmModal.tsx` instead of this one.
 */
export default function Modal({ visible, onClose, title, children }: Props) {
  return (
    <RNModal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {title && (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={palette.gray500} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    ...cardShadowElevated,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontFamily: typography.h3.fontFamily,
    fontWeight: "700",
    color: palette.gray900,
  },
  closeBtn: { padding: 4 },
  body: { padding: 20 },
});
