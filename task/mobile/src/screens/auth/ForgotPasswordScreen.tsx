import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  SafeAreaView, StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { authApi } from "@/api/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { palette, radius, spacing, typography, cardShadowElevated } from "@/theme/colors";

interface Props {
  onBack: () => void;
  onHaveCode?: () => void;
}

export default function ForgotPasswordScreen({ onBack, onHaveCode }: Props) {
  const { t } = useLanguage();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Toast.show({ type: "error", text1: "Email required", text2: "Please enter your email address." });
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(trimmed);
      setSent(true);
    } catch (err: any) {
      Toast.show({
        type:  "error",
        text1: "Request Failed",
        text2: err?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.topGrad}>
          <TouchableOpacity onPress={onBack} style={styles.backRow}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
            <Text style={styles.backRowTxt}>Back to Login</Text>
          </TouchableOpacity>
          <Text style={styles.headText}>Forgot Password</Text>
          <Text style={styles.subText}>Reset your account password</Text>
        </View>

        <View style={styles.successWrapper}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="mail-open-outline" size={40} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successSub}>
              We sent a password reset link to{"\n"}
              <Text style={styles.successEmail}>{email.trim()}</Text>
            </Text>
            <Text style={styles.successHint}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </Text>

            <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={styles.btn}>
              <Text style={styles.btnTxt}>Back to Login</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setSent(false); setEmail(""); }}
              style={styles.resendRow}
              activeOpacity={0.7}
            >
              <Text style={styles.resendTxt}>Didn't receive it? </Text>
              <Text style={styles.resendLink}>Try again</Text>
            </TouchableOpacity>

            {onHaveCode && (
              <TouchableOpacity
                onPress={onHaveCode}
                style={styles.resendRow}
                activeOpacity={0.7}
              >
                <Text style={styles.resendTxt}>Have a reset code already? </Text>
                <Text style={styles.resendLink}>Enter it here</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topGrad}>
        <TouchableOpacity onPress={onBack} style={styles.backRow}>
          <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          <Text style={styles.backRowTxt}>Back to Login</Text>
        </TouchableOpacity>
        <Text style={styles.headText}>Forgot Password</Text>
        <Text style={styles.subText}>We'll send you a reset link</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.formWrapper}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.iconRow}>
              <View style={styles.iconBox}>
                <Ionicons name="lock-open-outline" size={28} color="#fff" />
              </View>
            </View>

            <Text style={styles.cardTitle}>Reset your password</Text>
            <Text style={styles.cardSub}>
              Enter your account email address and we'll send you a link to reset your password.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={palette.gray400}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.btn, loading && styles.btnDisabled]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnTxt}>Send Reset Link</Text>
              }
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Remember your password? </Text>
              <TouchableOpacity onPress={onBack}>
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: "#fff" },
  topGrad:        { backgroundColor: palette.primary600, paddingTop: spacing.lg, paddingBottom: spacing["4xl"], paddingHorizontal: spacing["2xl"] },
  backRow:        { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.xl },
  backRowTxt:     { color: "rgba(255,255,255,0.9)", ...typography.bodyMedium },
  headText:       { color: "#fff", ...typography.h1, marginBottom: spacing.xs },
  subText:        { color: "rgba(255,255,255,0.75)", ...typography.body },

  formWrapper:    { flex: 1, marginTop: -28 },
  scroll:         { padding: spacing.lg },

  card:           { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing["2xl"], borderWidth: 1, borderColor: palette.gray100, ...cardShadowElevated },
  iconRow:        { alignItems: "center", marginBottom: spacing.lg },
  iconBox:        { width: 64, height: 64, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary600 },
  cardTitle:      { ...typography.h2, color: palette.gray900, textAlign: "center", marginBottom: spacing.sm },
  cardSub:        { ...typography.bodySm, color: palette.gray500, textAlign: "center", lineHeight: 20, marginBottom: spacing.xl },

  inputGroup:     { marginBottom: spacing.lg },
  label:          { ...typography.bodyMedium, color: palette.gray700, marginBottom: spacing.xs + 2 },
  inputRow:       { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md },
  inputIcon:      { marginRight: spacing.sm },
  input:          { flex: 1, height: 48, fontSize: typography.bodyLg.fontSize, color: palette.gray900 },

  btn:            { borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm, backgroundColor: palette.primary600, minHeight: 48 },
  btnDisabled:    { backgroundColor: palette.primary300 },
  btnTxt:         { color: "#fff", ...typography.bodyLg, fontWeight: "700" },

  loginRow:       { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  loginPrompt:    { color: palette.gray500, ...typography.body },
  loginLink:      { color: palette.primary600, ...typography.body, fontWeight: "700" },

  // Success state
  successWrapper: { flex: 1, marginTop: -28, justifyContent: "center" },
  successCard:    { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing["3xl"], marginHorizontal: spacing.lg, borderWidth: 1, borderColor: palette.gray100, alignItems: "center", ...cardShadowElevated },
  successIconWrap:{ width: 80, height: 80, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl, backgroundColor: palette.primary600 },
  successTitle:   { ...typography.h1, color: palette.gray900, marginBottom: spacing.md - 2 },
  successSub:     { ...typography.bodyLg, color: palette.gray500, textAlign: "center", lineHeight: 22, marginBottom: spacing.md },
  successEmail:   { fontWeight: "700", color: palette.gray700 },
  successHint:    { ...typography.bodySm, color: palette.gray400, textAlign: "center", lineHeight: 18, marginBottom: spacing["2xl"] },
  resendRow:      { flexDirection: "row", alignItems: "center", marginTop: spacing.lg },
  resendTxt:      { ...typography.bodySm, color: palette.gray500 },
  resendLink:     { ...typography.bodySm, color: palette.primary600, fontWeight: "700" },
});
