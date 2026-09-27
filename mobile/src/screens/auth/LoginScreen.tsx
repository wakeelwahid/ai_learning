import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView, StatusBar, Dimensions, ImageBackground,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authApi } from "@/api/auth";
import { contentApi } from "@/api/content";
import { BASE_URL } from "@/api/client";
import { setTokens } from "@/api/secureStorage";
import { setCredentials, setProfileComplete } from "@/store/authSlice";
import { useAppDispatch } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import LegalModal from "@/components/legal/LegalModal";
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from "@/components/legal/legalContent";
import { palette, radius, spacing, typography } from "@/theme/colors";

// NOTE: Google Sign-In is intentionally hidden from the UI only, per product
// decision to move to Mobile Number + OTP as the primary login method. The
// backend OAuth routes (authApi.googleOAuthUrl, /auth/google/*) are left
// completely untouched — this is a frontend-only change. To restore the
// button, uncomment the "Google Sign-In" block and its helpers below.
// import * as WebBrowser from "expo-web-browser";
// function GoogleIcon() {
//   return (
//     <View style={styles.gIcon}>
//       <Text style={styles.gIconTxt}>G</Text>
//     </View>
//   );
// }
// function parseTokensFromUrl(url: string): Record<string, string> {
//   const qs = url.split("?")[1] || "";
//   const params: Record<string, string> = {};
//   qs.split("&").forEach(pair => {
//     const [k, v] = pair.split("=");
//     if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
//   });
//   return params;
// }

// NOTE: Email + password login/registration is intentionally removed from
// THIS app entirely — students and parents sign in with Mobile Number + OTP
// only. The backend route (POST /auth/login) is still reachable and still
// used by the separate admin app; auth_service.login() now rejects any
// non-admin account with a message pointing them back to OTP, so this
// isn't just a UI change. Email/password registration has been removed
// backend-side too (no /register route exists anymore).

interface Props {
  onLogin:           () => void;
  onProfileIncomplete?: () => void;
  onRoleSelect?:        () => void;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return digits;
}

function isValidPhone(raw: string): boolean {
  return /^\+\d{10,15}$/.test(normalizePhone(raw));
}

// The field only accepts a bare 10-digit national number (normalizePhone
// prepends +91), so we can validate and cap length as the user types.
function sanitizePhoneInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

function phoneFieldError(digitsOnly: string): string | null {
  if (!digitsOnly) return null;
  if (digitsOnly.length < 10) return "Enter a 10-digit mobile number.";
  if (!/^[6-9]/.test(digitsOnly)) return "Enter a valid Indian mobile number.";
  return null;
}

const OTP_GAP = 10;
const OTP_BOX_COUNT = 6;
// Fallback used until the active-background fetch resolves, and permanently
// if no admin has uploaded one yet — see the login-background effect below.
const DEFAULT_HERO_BG = "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Ecoliers_en_uniforme_dans_le_d%C3%A9sert_du_Thar_%28Rajasthan%29_%281%29.jpg/960px-Ecoliers_en_uniforme_dans_le_d%C3%A9sert_du_Thar_%28Rajasthan%29_%281%29.jpg";
// Same visual language as the web login page's unified layout
// (frontend/src/pages/auth/LoginPage.tsx) — dark purple hero panel over the
// photo, kept identical across platforms. The web layout's feature-badge
// list is desktop-only there too (hidden below `lg:`), so the compact
// mobile screen here skips straight to the class chip row.
const { width: WINDOW_WIDTH } = Dimensions.get("window");
const OTP_AVAILABLE_WIDTH = WINDOW_WIDTH - 32 * 2 - OTP_GAP * (OTP_BOX_COUNT - 1);
const OTP_BOX_SIZE = Math.max(28, Math.min(46, Math.floor(OTP_AVAILABLE_WIDTH / OTP_BOX_COUNT)));

export default function LoginScreen({ onLogin, onProfileIncomplete, onRoleSelect }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useLanguage();
  const [showTerms,     setShowTerms]     = useState(false);
  const [showPrivacy,   setShowPrivacy]   = useState(false);

  const [phone,           setPhone]           = useState("");
  const [otpStep,         setOtpStep]         = useState<"phone" | "otp">("phone");
  const [otpDigits,       setOtpDigits]       = useState<string[]>(Array(6).fill(""));
  const [sendLoading,     setSendLoading]     = useState(false);
  const [verifyLoading,   setVerifyLoading]   = useState(false);
  const [resendCooldown,  setResendCooldown]  = useState(0);
  const [phoneError,      setPhoneError]      = useState<string | null>(null);
  const [heroBg,          setHeroBg]          = useState(DEFAULT_HERO_BG);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  useEffect(() => {
    let cancelled = false;
    contentApi.getActiveLoginBackground()
      .then(res => {
        const path = res.data?.image_path;
        // path already looks like "/api/v1/content/...", and BASE_URL itself
        // ends in "/api" — strip that leading segment before concatenating,
        // or the two "/api"s double up into a 404.
        if (!cancelled && path) setHeroBg(`${BASE_URL}${path.replace(/^\/api/, "")}`);
      })
      .catch(() => {}); // stay on DEFAULT_HERO_BG — never block login on this
    return () => { cancelled = true; };
  }, []);

  const handleSendOtp = async () => {
    const fieldErr = phoneFieldError(phone);
    if (fieldErr || !isValidPhone(phone)) {
      setPhoneError(fieldErr ?? "Please enter a valid 10-digit mobile number.");
      return;
    }
    setPhoneError(null);
    setSendLoading(true);
    try {
      await authApi.sendPhoneOtp(normalizePhone(phone));
      setOtpDigits(Array(6).fill(""));
      setResendCooldown(60);
      setOtpStep("otp");
    } catch (err: any) {
      setPhoneError(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Could not send the OTP right now. Please try again.");
    } finally {
      setSendLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      await authApi.sendPhoneOtp(normalizePhone(phone));
      setResendCooldown(60);
      setOtpDigits(Array(6).fill(""));
      otpRefs.current[0]?.focus();
    } catch (err: any) {
      setPhoneError(err?.response?.data?.detail || "Failed to resend code.");
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpBackspace = (index: number) => {
    if (!otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) { setPhoneError("Enter all 6 digits"); return; }
    setPhoneError(null);
    setVerifyLoading(true);
    try {
      const { data } = await authApi.verifyPhoneOtp(normalizePhone(phone), code);
      await setTokens(data.access_token, data.refresh_token);
      const { data: user } = await authApi.me();
      await AsyncStorage.setItem("auth_user", JSON.stringify(user));
      dispatch(setCredentials({ token: data.access_token, user }));
      dispatch(setProfileComplete(data.profile_complete));
      if (data.is_new_user) {
        // Brand-new account — role is "pending" until RoleSelectScreen runs.
        onRoleSelect ? onRoleSelect() : onProfileIncomplete?.() ?? onLogin();
      } else if (data.profile_complete) {
        onLogin();
      } else {
        onProfileIncomplete ? onProfileIncomplete() : onLogin();
      }
    } catch (err: any) {
      setPhoneError(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Invalid or expired code. Please try again.");
      setOtpDigits(Array(6).fill(""));
      otpRefs.current[0]?.focus();
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ImageBackground source={{ uri: heroBg }} style={styles.topGrad} imageStyle={styles.topGradImg}>
          {/* Diagonal gradient, not a flat wash — the photo itself should
              stay clearly visible; the darkening only exists so the white
              brand text stays readable, same visual language as the web
              login page's hero panel. */}
          <LinearGradient
            colors={["rgba(30,27,75,0.75)", "rgba(30,27,75,0.35)", "rgba(30,27,75,0.15)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.topGradOverlay}
          />
          <View style={styles.brandRow}>
            <View style={styles.iconBox}>
              <Ionicons name="school" size={20} color="#fff" />
            </View>
            <View>
              <Text style={styles.brandName}>EduAI</Text>
              <Text style={styles.brandSub}>AI-Powered</Text>
            </View>
          </View>

          <View>
            <Text style={styles.heroSub}>Smarter learning. Better results.</Text>
            <View style={styles.classPill}>
              <Text style={styles.classPillTxt}>Classes 6–12</Text>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.formWrapper}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("welcomeBack")}</Text>
            <Text style={styles.cardSub}>{t("loginSub")}</Text>

            {otpStep === "phone" ? (
              <>
                {phoneError && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color={palette.danger600} />
                    <Text style={styles.errorTxt}>{phoneError}</Text>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mobile Number</Text>
                  <View style={[styles.inputRow, !!phoneFieldError(phone) && styles.inputRowError]}>
                    <Ionicons name="call-outline" size={18} color={palette.gray400} style={styles.inputIcon} />
                    <Text style={styles.phonePrefix}>+91</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="98765 43210"
                      placeholderTextColor={palette.gray400}
                      value={phone}
                      onChangeText={(v) => { setPhone(sanitizePhoneInput(v)); setPhoneError(null); }}
                      keyboardType="number-pad"
                      maxLength={10}
                      autoFocus
                      underlineColorAndroid="transparent"
                      selectionColor={palette.primary600}
                    />
                  </View>
                  {phoneFieldError(phone) && (
                    <Text style={styles.fieldErrorTxt}>{phoneFieldError(phone)}</Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={sendLoading || !!phoneFieldError(phone) || !isValidPhone(phone)}
                  activeOpacity={0.85}
                  style={[styles.loginBtn, (sendLoading || !!phoneFieldError(phone) || !isValidPhone(phone)) && styles.loginBtnDisabled]}
                >
                  {sendLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={styles.loginTxt}>Send OTP</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </View>
                    )
                  }
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ alignItems: "center" }}>
                <Text style={styles.otpSub}>
                  We sent a 6-digit code to{"\n"}
                  <Text style={styles.otpPhone}>{normalizePhone(phone)}</Text>
                </Text>

                {phoneError && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color={palette.danger600} />
                    <Text style={styles.errorTxt}>{phoneError}</Text>
                  </View>
                )}

                <View style={styles.otpBoxRow}>
                  {otpDigits.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={el => { otpRefs.current[i] = el; }}
                      style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                      value={digit}
                      onChangeText={v => handleOtpChange(i, v)}
                      onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === "Backspace") handleOtpBackspace(i); }}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                    />
                  ))}
                </View>

                <TouchableOpacity
                  onPress={handleVerifyOtp}
                  disabled={verifyLoading || otpDigits.join("").length < 6}
                  activeOpacity={0.85}
                  style={[
                    styles.loginBtn,
                    { alignSelf: "stretch" },
                    (verifyLoading || otpDigits.join("").length < 6) && styles.loginBtnDisabled,
                  ]}
                >
                  {verifyLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.loginTxt}>Verify & Continue</Text>
                  }
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  <Text style={styles.resendPrompt}>Didn't receive it? </Text>
                  {resendCooldown > 0 ? (
                    <Text style={styles.resendTimer}>Resend in {resendCooldown}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResendOtp}>
                      <Text style={styles.resendLink}>Resend code</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity onPress={() => setOtpStep("phone")} style={styles.backBtn}>
                  <Ionicons name="arrow-back-outline" size={14} color={palette.gray400} />
                  <Text style={styles.backBtnTxt}>Change mobile number</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Google Sign-In — hidden per product decision, backend untouched
            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerTxt}>or</Text>
              <View style={styles.line} />
            </View>
            <TouchableOpacity onPress={handleGoogleLogin} disabled={googleLoading} activeOpacity={0.85} style={styles.googleBtn}>
              {googleLoading ? <ActivityIndicator color="#374151" size="small" /> : <><GoogleIcon /><Text style={styles.googleTxt}>Continue with Google</Text></>}
            </TouchableOpacity>
            */}

            {/* Legal links */}
            <View style={styles.legalRow}>
              <Text style={styles.legalTxt}>{t("agreeToTerms")} </Text>
              <TouchableOpacity onPress={() => setShowTerms(true)}>
                <Text style={styles.legalLink}>{t("termsOfService")}</Text>
              </TouchableOpacity>
              <Text style={styles.legalTxt}> {t("and")} </Text>
              <TouchableOpacity onPress={() => setShowPrivacy(true)}>
                <Text style={styles.legalLink}>{t("privacyPolicy")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <LegalModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        title={t("termsOfService")}
        subtitle="Last updated: June 2026"
        sections={TERMS_SECTIONS}
        accentColor={palette.primary600}
      />
      <LegalModal
        visible={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title={t("privacyPolicy")}
        subtitle="Last updated: June 2026"
        sections={PRIVACY_SECTIONS}
        accentColor={palette.primary600}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: "#fff" },
  // No ScrollView anywhere in this screen on purpose — it must fit on one
  // screen with no scrolling, so every size below is deliberately compact
  // rather than the more generously-spaced desktop/web version.
  // minHeight (not just padding) so the photo actually has room to show —
  // padding alone let content height collapse the image to a thin sliver.
  // space-between keeps the brand row pinned to the top and the
  // headline/pill pinned to the bottom, with visible photo in between.
  // #1e1b4b matches the gradient overlay's own tint color (rgba(30,27,75,…)
  // below) so any letterboxed space from resizeMode:"contain" blends with
  // the overlay instead of showing a mismatched color band.
  topGrad:         { minHeight: 260, paddingTop: spacing["2xl"], paddingBottom: spacing["2xl"], paddingHorizontal: spacing.xl, overflow: "hidden", justifyContent: "space-between", backgroundColor: "#1e1b4b" },
  // contain (not cover) — an admin can upload ANY image, any aspect ratio,
  // any subject. cover crops to fill the box and will randomly cut off
  // whatever the image's important content is (a face, a head, etc.);
  // contain always shows the whole image, letterboxed on solid
  // topGrad.backgroundColor rather than gambling on a crop.
  topGradImg:      { resizeMode: "contain" },
  topGradOverlay:  { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  brandRow:        { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2, marginBottom: spacing.lg },
  iconBox:         { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  brandName:       { color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 19 },
  brandSub:        { color: "rgba(255,255,255,0.6)", fontSize: 11, lineHeight: 14 },
  heroSub:         { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: spacing.md },
  classPill:       { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  classPillTxt:    { color: "#fff", fontSize: 11, fontWeight: "700" },
  formWrapper:     { flex: 1, backgroundColor: "#fff" },
  card:            { flex: 1, padding: spacing.xl, paddingTop: spacing["5xl"] },
  cardTitle:       { fontSize: 22, fontWeight: "800", color: palette.gray900, marginBottom: spacing.xs },
  cardSub:         { ...typography.bodySm, color: palette.gray500, marginBottom: spacing.lg },
  inputGroup:      { marginBottom: spacing.lg },
  label:           { ...typography.bodyMedium, color: palette.gray700, marginBottom: spacing.xs + 2 },
  inputRow:        { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md },
  inputRowError:   { borderColor: palette.danger500 },
  inputIcon:       { marginRight: spacing.sm },
  phonePrefix:     { fontSize: typography.bodyLg.fontSize, color: palette.gray700, fontWeight: "600", marginRight: spacing.xs + 2 },
  fieldErrorTxt:   { ...typography.bodySm, color: palette.danger600, marginTop: spacing.xs + 2 },
  // outlineStyle is a react-native-web-only extension (not in RN's own
  // TextStyle types) that suppresses the browser's native focus-ring box
  // drawn around the underlying <input> when this renders via Expo Web —
  // without it, focusing this field shows an extra rectangle around the
  // typed digits that has nothing to do with inputRow's own border.
  input:           { flex: 1, height: 48, fontSize: typography.bodyLg.fontSize, color: palette.gray900, ...( { outlineStyle: "none" } as object) },
  eyeBtn:          { padding: spacing.xs },
  loginBtn:        { borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm, backgroundColor: palette.primary600, minHeight: 48 },
  loginBtnDisabled:{ backgroundColor: palette.primary300 },
  loginTxt:        { color: "#fff", ...typography.bodyLg, fontWeight: "700" },
  divider:         { flexDirection: "row", alignItems: "center", marginVertical: spacing.xl },
  line:            { flex: 1, height: 1, backgroundColor: palette.gray200 },
  dividerTxt:      { marginHorizontal: spacing.md, color: palette.gray400, ...typography.bodySm },
  googleBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm + 2, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.lg, paddingVertical: spacing.md + 2, backgroundColor: "#fff", marginBottom: spacing.lg },
  googleTxt:       { ...typography.bodyMedium, color: palette.gray700 },
  gIcon:           { width: 22, height: 22, borderRadius: 11, backgroundColor: "#4285F4", alignItems: "center", justifyContent: "center" },
  gIconTxt:        { color: "#fff", fontSize: 13, fontWeight: "800" },
  legalRow:        { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: spacing.lg },
  legalTxt:        { ...typography.caption, textTransform: "none", letterSpacing: 0, fontWeight: "400", color: palette.gray400 },
  legalLink:       { ...typography.caption, textTransform: "none", letterSpacing: 0, color: palette.primary600 },

  errorBox:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.danger50, borderWidth: 1, borderColor: "#FCA5A5", borderRadius: radius.sm + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md + 2, alignSelf: "stretch" },
  errorTxt:        { ...typography.bodySm, color: palette.danger600, flex: 1 },

  otpSub:          { ...typography.bodySm, color: palette.gray500, textAlign: "center", lineHeight: 20, marginBottom: spacing.lg },
  otpPhone:        { fontWeight: "700", color: palette.gray700 },
  otpBoxRow:       { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: OTP_GAP, marginBottom: spacing.xl },
  otpBox:          { width: OTP_BOX_SIZE, height: OTP_BOX_SIZE + 10, borderRadius: radius.md, borderWidth: 2, borderColor: palette.gray200, backgroundColor: "#fff", textAlign: "center", fontSize: 22, fontWeight: "800", color: palette.gray900 },
  otpBoxFilled:    { borderColor: palette.primary600, backgroundColor: palette.primary50 },
  resendRow:       { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  resendPrompt:    { ...typography.bodySm, color: palette.gray500 },
  resendTimer:     { ...typography.bodySm, color: palette.gray400 },
  resendLink:      { ...typography.bodySm, color: palette.primary600, fontWeight: "700" },
  backBtn:         { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xl, minHeight: 44, justifyContent: "center" },
  backBtnTxt:      { fontSize: typography.bodySm.fontSize, color: palette.gray400 },
});
