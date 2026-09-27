import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, cardShadowElevated } from "@/theme/colors";

// A real, app-styled replacement for Alert.alert()/window.confirm() — RN's
// Alert.alert() is a complete no-op on react-native-web (this app also runs
// as a web build), and even where it does work, a bare OS alert/confirm
// looks broken against the rest of the app's design. This renders as an
// actual Modal, so it behaves identically on native and web.

export type ConfirmVariant = "default" | "destructive" | "warning" | "info";

const VARIANT_CFG: Record<ConfirmVariant, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  default:     { icon: "help-circle",         color: palette.primary600, bg: palette.primary50 },
  destructive: { icon: "trash-outline",       color: palette.danger600,  bg: "#FEF2F2" },
  warning:     { icon: "warning-outline",     color: palette.warning600, bg: "#FFFBEB" },
  info:        { icon: "information-circle",  color: palette.info500,    bg: "#ECFEFF" },
};

interface Props {
  visible: boolean;
  variant?: ConfirmVariant;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible, variant = "default", title, message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  onConfirm, onCancel,
}: Props) {
  const cfg = VARIANT_CFG[variant];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={26} color={cfg.color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnTxt}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: cfg.color }]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnTxt}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: radius.xl, padding: 24, alignItems: "center", ...cardShadowElevated },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 17, fontWeight: "800", color: "#111827", textAlign: "center" },
  message: { fontSize: 13.5, color: "#6B7280", textAlign: "center", marginTop: 8, lineHeight: 19 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 22, width: "100%" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: "#F3F4F6", alignItems: "center" },
  cancelBtnTxt: { fontSize: 14, fontWeight: "700", color: "#374151" },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: "center" },
  confirmBtnTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
