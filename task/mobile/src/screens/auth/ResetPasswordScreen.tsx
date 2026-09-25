import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  SafeAreaView, StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { authApi } from "@/api/auth";
import { palette, radius, spacing, typography, cardShadowElevated } from "@/theme/colors";

interface Props {
  onBack: () => void;
  onDone: () => void;
}

const passwordRules = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p), label: "One uppercase letter" },
  { test: (p: string) => /\d/.test(p), label: "One number" },
];

export default function ResetPasswordScreen({ onBack, onDone }: Props) {
  const [token,           setToken]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);

  const passwordValid = passwordRules.every(r => r.test(password));
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = token.trim().length > 0 && passwordValid && passwordsMatch;

  const handleSubmit = async () => {
    if (!token.trim()) {
      Toast.show({ type: "error", text1: "Reset code required", text2: "Paste the code from your reset email." });
      return;
    }
    if (!passwordValid) {
      Toast.show({ type: "error", text1: "Weak password", text2: "Please meet all password requirements." });
      return;
    }
    if (!passwordsMatch) {
      Toast.show({ type: "error", text1: "Passwords don't match", text2: "Please confirm your new password." });
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token.trim(), password);
      setDone(true);
      setTimeout(onDone, 1500);
    } catch (err: any) {
      Toast.show({
        type:  "error",
        text1: "Reset Failed",
        text2: err?.response?.data?.detail || "This code may be invalid or expired.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.topGrad}>
          <TouchableOpacity onPress={onDone} style={styles.backRow}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
            <Text style={styles.backRowTxt}>Back to Login</Text>
          </TouchableOpacity>
          <Text style={styles.headText}>Reset Password</Text>
          <Text style={styles.subText}>Set a new password for your account</Text>
        </View>

        <View style={styles.successWrapper}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={40} color={palette.primary600} />
            </View>
            <Text style={styles.successTitle}>Password updated</Text>
            <Text style={styles.successSub}>Redirecting you to sign in…</Text>

            <TouchableOpacity onPress={onDone} activeOpacity={0.85} style={styles.btn}>
              <Text style={styles.btnTxt}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topGrad}>
        <TouchableOpacity onPress={onDone} style={styles.backRow}>
          <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          <Text style={styles.backRowTxt}>Back to Login</Text>
        </TouchableOpacity>
        <Text style={styles.headText}>Reset Password</Text>
        <Text style={styles.subText}>Paste your code and choose a new password</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.formWrapper}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.iconRow}>
              <View style={styles.iconBox}>
                <Ionicons name="key-outline" size={28} color={palette.primary600} />
              </View>
            </View>

            <Text style={styles.cardTitle}>Enter your reset code</Text>
            <Text style={styles.cardSub}>
              Check your email for the reset link, then copy the code from it and paste it below.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Reset Code</Text>
              <View style={styles.inputRow}>
                <Ionicons name="clipboard-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Paste the code from your email"
                  placeholderTextColor={palette.gray400}
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  placeholderTextColor={palette.gray400}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={palette.gray400} />
                </TouchableOpacity>
              </View>
              {password.length > 0 && (
                <View style={styles.rulesList}>
                  {passwordRules.map((rule) => {
                    const ok = rule.test(password);
                    return (
                      <View key={rule.label} style={styles.ruleRow}>
                        <Ionicons
                          name={ok ? "checkmark-circle" : "ellipse-outline"}
                          size={13}
                          color={ok ? palette.success500 : palette.gray300}
                        />
                        <Text style={[styles.ruleTxt, ok && styles.ruleTxtOk]}>{rule.label}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your new password"
                  placeholderTextColor={palette.gray400}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
              </View>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <Text style={styles.mismatchTxt}>Passwords don't match</Text>
              )}
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading || !canSubmit}
              activeOpacity={0.85}
              style={[styles.btn, (loading || !canSubmit) && styles.btnDisabled]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnTxt}>Reset Password</Text>
              }
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Remember your password? </Text>
              <TouchableOpacity onPress={onDone}>
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
  iconBox:        { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  cardTitle:      { ...typography.h2, color: palette.gray900, textAlign: "center", marginBottom: spacing.sm },
  cardSub:        { ...typography.bodySm, color: palette.gray500, textAlign: "center", lineHeight: 20, marginBottom: spacing.xl },

  inputGroup:     { marginBottom: spacing.lg },
  label:          { ...typography.bodyMedium, color: palette.gray700, marginBottom: spacing.xs + 2 },
  inputRow:       { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md },
  inputIcon:      { marginRight: spacing.sm },
  input:          { flex: 1, height: 48, fontSize: typography.bodyLg.fontSize, color: palette.gray900 },
  eyeBtn:         { padding: spacing.xs },

  rulesList:      { marginTop: spacing.sm, gap: spacing.xs },
  ruleRow:        { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ruleTxt:        { ...typography.bodySm, color: palette.gray400 },
  ruleTxtOk:      { color: palette.success700 },
  mismatchTxt:    { ...typography.bodySm, color: palette.danger500, marginTop: spacing.sm },

  btn:            { borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm, backgroundColor: palette.primary600, minHeight: 48 },
  btnDisabled:    { backgroundColor: palette.primary300 },
  btnTxt:         { color: "#fff", ...typography.bodyLg, fontWeight: "700" },

  loginRow:       { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  loginPrompt:    { color: palette.gray500, ...typography.body },
  loginLink:      { color: palette.primary600, ...typography.body, fontWeight: "700" },

  // Success state
  successWrapper: { flex: 1, marginTop: -28, justifyContent: "center" },
  successCard:    { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing["3xl"], marginHorizontal: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadowElevated, alignItems: "center" },
  successIconWrap:{ width: 80, height: 80, borderRadius: radius.xl, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  successTitle:   { ...typography.h1, color: palette.gray900, marginBottom: spacing.md - 2 },
  successSub:     { ...typography.bodyLg, color: palette.gray500, textAlign: "center", lineHeight: 22, marginBottom: spacing["2xl"] },
});
