import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authApi } from "@/api/auth";
import { updateUser } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store";
import { palette, radius, spacing, typography, cardShadowElevated } from "@/theme/colors";

interface Props {
  onDone: () => void;
}

// One-time role choice for a brand-new phone-OTP account (role=pending
// until this runs). Shown right after OTP verify when is_new_user is true
// (see LoginScreen's onRoleSelect) — calls PATCH /auth/role exactly once;
// the backend locks it permanently after that, so this screen is never
// shown again for this account.
export default function RoleSelectScreen({ onDone }: Props) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(s => s.auth.user);
  const [loading, setLoading] = useState<"student" | "parent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: "student" | "parent") {
    if (loading) return;
    setError(null);
    setLoading(role);
    try {
      const { data: updated } = await authApi.setRole(role);
      dispatch(updateUser({ role: updated.role }));
      if (user) await AsyncStorage.setItem("auth_user", JSON.stringify({ ...user, role: updated.role }));
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not save your choice. Please try again.");
      setLoading(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>How will you use EduAI?</Text>
        <Text style={styles.subtitle}>Choose one — this can't be changed later.</Text>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color={palette.danger600} />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}

        <View style={styles.cardRow}>
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            disabled={loading !== null}
            onPress={() => choose("student")}
          >
            <View style={styles.iconBox}>
              <Ionicons name="school-outline" size={28} color={palette.primary600} />
            </View>
            <Text style={styles.cardTitle}>I'm a Student</Text>
            <Text style={styles.cardSub}>Learn, practice, and track my own progress</Text>
            {loading === "student" && <ActivityIndicator style={{ marginTop: spacing.sm }} color={palette.primary600} size="small" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            disabled={loading !== null}
            onPress={() => choose("parent")}
          >
            <View style={styles.iconBox}>
              <Ionicons name="people-outline" size={28} color={palette.primary600} />
            </View>
            <Text style={styles.cardTitle}>I'm a Parent</Text>
            <Text style={styles.cardSub}>Monitor and support my child's learning</Text>
            {loading === "parent" && <ActivityIndicator style={{ marginTop: spacing.sm }} color={palette.primary600} size="small" />}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: "#fff" },
  content:    { flex: 1, justifyContent: "center", paddingHorizontal: spacing["2xl"] },
  title:      { ...typography.h1, color: palette.gray900, textAlign: "center", marginBottom: spacing.xs },
  subtitle:   { ...typography.body, color: palette.gray500, textAlign: "center", marginBottom: spacing["2xl"] },
  cardRow:    { flexDirection: "row", gap: spacing.md },
  card:       {
    flex: 1, alignItems: "center", padding: spacing.lg, borderRadius: radius.xl,
    borderWidth: 1.5, borderColor: palette.gray200, backgroundColor: "#fff", ...cardShadowElevated,
  },
  iconBox:    { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  cardTitle:  { ...typography.bodyMedium, fontWeight: "700", color: palette.gray900, textAlign: "center", marginBottom: spacing.xs },
  cardSub:    { ...typography.caption, textTransform: "none", letterSpacing: 0, color: palette.gray500, textAlign: "center" },
  errorBox:   { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.danger50, borderWidth: 1, borderColor: "#FCA5A5", borderRadius: radius.sm + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.lg },
  errorTxt:   { ...typography.bodySm, color: palette.danger600, flex: 1 },
});
