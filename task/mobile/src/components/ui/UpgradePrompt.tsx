import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { palette, radius } from "@/theme/colors";

interface Props {
  /** The backend's ready-to-show message (gamification_service's
      FeatureUsageService always sets this on a feature_limit_reached 429)
      — rendered verbatim, never a client-authored fallback string. */
  message: string;
  /** compact = inline strip (fits inside a card/panel); full = standalone
      block with more breathing room (fits where an error used to occupy
      the whole content area). */
  variant?: "compact" | "full";
}

// Shown wherever a gated feature's daily quota is hit (429 from
// gamification_service's FeatureUsageService) — mobile counterpart of
// web's UpgradePrompt.tsx, same rule: message always comes from the
// backend, never invented here.
export default function UpgradePrompt({ message, variant = "full" }: Props) {
  const navigation = useNavigation<any>();
  const goToSubscription = () => navigation.navigate("Subscription");

  if (variant === "compact") {
    return (
      <View style={styles.compactWrap}>
        <View style={styles.compactIcon}>
          <Ionicons name="time" size={16} color="#fff" />
        </View>
        <Text style={styles.compactText}>{message}</Text>
        <TouchableOpacity style={styles.compactBtn} onPress={goToSubscription} activeOpacity={0.85}>
          <Ionicons name="sparkles" size={13} color="#fff" />
          <Text style={styles.compactBtnTxt}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fullWrap}>
      <View style={styles.fullIcon}>
        <Ionicons name="time" size={24} color="#fff" />
      </View>
      <Text style={styles.fullText}>{message}</Text>
      <TouchableOpacity style={styles.fullBtn} onPress={goToSubscription} activeOpacity={0.85}>
        <Ionicons name="sparkles" size={16} color="#fff" />
        <Text style={styles.fullBtnTxt}>Upgrade to Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: palette.primary50, borderWidth: 1, borderColor: palette.primary100,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10,
  },
  compactIcon: {
    width: 28, height: 28, borderRadius: 10, backgroundColor: palette.primary600,
    alignItems: "center", justifyContent: "center",
  },
  compactText: { flex: 1, fontSize: 12.5, color: palette.gray700, lineHeight: 17 },
  compactBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.primary600,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  compactBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 11.5 },

  fullWrap: {
    borderRadius: radius.xl, borderWidth: 1, borderColor: palette.primary100,
    backgroundColor: palette.primary50, padding: 24, alignItems: "center",
  },
  fullIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: palette.primary600,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  fullText: { fontSize: 13.5, fontWeight: "600", color: palette.gray900, textAlign: "center", maxWidth: 280 },
  fullBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: palette.primary600,
    borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16,
  },
  fullBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
