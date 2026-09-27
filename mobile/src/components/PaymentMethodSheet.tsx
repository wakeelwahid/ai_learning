import React, { useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";

// Shown in place of Cashfree's real hosted checkout only when the backend is
// running in test_mode (no real CASHFREE_APP_ID configured) — a fake
// test-mode payment_session_id can't be handed to the real Cashfree SDK, so
// this gives the same "choose a payment method" visual step Cashfree's own
// checkout would otherwise render inside CashfreeCheckout.tsx's WebView.

const UPI_APPS = ["PhonePe", "Google Pay", "Paytm", "Amazon Pay", "BHIM"];
const OTHER_METHODS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Debit / Credit Card", icon: "card-outline" },
  { label: "Net Banking",          icon: "business-outline" },
  { label: "Wallets",              icon: "wallet-outline" },
];

interface Props {
  visible: boolean;
  amountLabel: string;   // e.g. "₹149"
  planName: string;
  onSelect: (method: string) => void;
  onCancel: () => void;
}

export default function PaymentMethodSheet({ visible, amountLabel, planName, onSelect, onCancel }: Props) {
  const [processing, setProcessing] = useState<string | null>(null);

  const handlePick = (method: string) => {
    if (processing) return;
    setProcessing(method);
    setTimeout(() => {
      setProcessing(null);
      onSelect(method);
    }, 900);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => !processing && onCancel()}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Choose Payment Method</Text>
              <Text style={styles.subtitle}>{planName} · {amountLabel}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => !processing && onCancel()}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 16, gap: 18 }}>
            <View>
              <View style={styles.sectionLabelRow}>
                <View style={styles.dot} />
                <Text style={styles.sectionLabel}>UPI Apps</Text>
              </View>
              <View style={styles.grid}>
                {UPI_APPS.map((app) => (
                  <TouchableOpacity
                    key={app}
                    style={styles.gridBtn}
                    onPress={() => handlePick(app)}
                    disabled={!!processing}
                    activeOpacity={0.8}
                  >
                    {processing === app ? <ActivityIndicator size="small" color={palette.primary600} /> : <Text style={styles.gridBtnTxt}>{app}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: "#6B7280", marginBottom: 10 }]}>Other Methods</Text>
              <View style={{ gap: 8 }}>
                {OTHER_METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.label}
                    style={styles.rowBtn}
                    onPress={() => handlePick(m.label)}
                    disabled={!!processing}
                    activeOpacity={0.8}
                  >
                    {processing === m.label ? (
                      <ActivityIndicator size="small" color={palette.primary600} />
                    ) : (
                      <Ionicons name={m.icon} size={18} color="#9CA3AF" />
                    )}
                    <Text style={styles.rowBtnTxt}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.footerRow}>
              <Ionicons name="shield-checkmark-outline" size={13} color="#9CA3AF" />
              <Text style={styles.footerTxt}>Secured by Cashfree · Test mode — no real charge</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  title: { fontSize: 17, fontWeight: "800", color: "#111827" },
  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridBtn: { width: "48%", borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  gridBtnTxt: { fontSize: 13, fontWeight: "700", color: "#374151" },
  rowBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBtnTxt: { fontSize: 13, fontWeight: "700", color: "#374151" },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingTop: 4, paddingBottom: 8 },
  footerTxt: { fontSize: 10.5, color: "#9CA3AF" },
});
