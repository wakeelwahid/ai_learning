import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Switch, Alert, TextInput,
  Modal, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { useAppDispatch, useAppSelector } from "@/store";
import { clearCredentials, setCredentials } from "@/store/authSlice";
import { useLanguage } from "@/contexts/LanguageContext";
import { authApi, type DeviceSession } from "@/api/auth";
import { getAccessToken, clearTokens } from "@/api/secureStorage";
import { notificationApi } from "@/api/notification";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { firstNameOf } from "@/components/parent/PendingApproval";
import ApprovalModeSwitch from "@/components/parent/ApprovalModeSwitch";
import { fmt } from "@/i18n/format";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { palette, semantic, accentSolid, radius, cardShadow, typography, spacing } from "@/theme/colors";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { Button, Input } from "@/components/ui";

// ── Password strength (mirrors backend rule: 8+ chars, 1 uppercase, 1 digit) —
// same helpers as ProfileScreen.tsx (student), duplicated rather than shared
// since neither screen currently exports these for reuse.
interface PwCheck { label: string; passed: boolean; }
function getPasswordChecks(pw: string): PwCheck[] {
  return [
    { label: "At least 8 characters",     passed: pw.length >= 8 },
    { label: "One uppercase letter (A-Z)", passed: /[A-Z]/.test(pw) },
    { label: "One number (0-9)",           passed: /\d/.test(pw) },
  ];
}
function isPasswordStrong(pw: string): boolean {
  return getPasswordChecks(pw).every(c => c.passed);
}

// ── Device icon mapper for Active Sessions ─────────────────────────────────────
function deviceIcon(deviceType: string | null): string {
  const t = (deviceType || "").toLowerCase();
  if (t.includes("mobile") || t.includes("phone")) return "phone-portrait-outline";
  if (t.includes("tablet"))                         return "tablet-portrait-outline";
  if (t.includes("desktop") || t.includes("web"))    return "desktop-outline";
  return "hardware-chip-outline";
}
function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)      return "just now";
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── gradient colors per language (mirrors ProfileScreen) — these are
// per-language decorative theming, not the brand indigo→violet pairing, so
// they remain legitimate LinearGradient uses. "en"'s pair is indigo→indigo-500
// (primary600→primary500), not indigo→violet, so it stays a gradient too.
const LANG_GRADIENTS: Record<Lang, [string, string]> = {
  en: [palette.primary600, palette.primary500],
  hi: ["#F97316", "#EF4444"],
  pa: ["#10B981", "#059669"],
  ur: ["#8B5CF6", "#7C3AED"],
};

// ── Reusable setting row (same pattern as ProfileScreen) ──────────────────────
interface RowProps {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  tint?: string;
  right?: React.ReactNode;
  noBorder?: boolean;
  disabled?: boolean;
}
function SettingRow({ icon, label, value, onPress, tint = palette.primary600, right, noBorder, disabled }: RowProps) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, noBorder && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.65 : 1}
      disabled={disabled}
    >
      <View style={[styles.settingIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon as any} size={18} color="#fff" />
      </View>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingRight}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        {right}
        {onPress && !right && !value && (
          <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Language Option Row (same pattern as ProfileScreen) ───────────────────────
function LangOption({
  lang, selected, onSelect,
}: {
  lang: typeof LANGUAGES[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.7}
      style={[styles.langOption, selected && styles.langOptionActive]}
    >
      <LinearGradient
        colors={LANG_GRADIENTS[lang.code as Lang]}
        style={styles.langFlag}
      >
        <Text style={styles.langFlagTxt}>{lang.script.slice(0, 1)}</Text>
      </LinearGradient>
      <View style={styles.langInfo}>
        <Text style={[styles.langNative, lang.dir === "rtl" && styles.rtl]}>
          {lang.nativeLabel}
        </Text>
        <Text style={styles.langEng}>{lang.label}</Text>
      </View>
      {selected && (
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ParentSettingsScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const { t, language, setLanguage } = useLanguage();
  const user = useAppSelector(s => s.auth.user);

  const [darkMode,      setDarkMode]      = useState(false);
  const [showLangPanel, setShowLangPanel] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName,      setEditName]      = useState(user?.full_name ?? "");
  const [saving,        setSaving]        = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Change Password
  const [showChangePw,      setShowChangePw]      = useState(false);
  const [currentPw,         setCurrentPw]         = useState("");
  const [newPw,             setNewPw]             = useState("");
  const [confirmPw,         setConfirmPw]         = useState("");
  const [showCurrentPw,     setShowCurrentPw]     = useState(false);
  const [showNewPw,         setShowNewPw]         = useState(false);
  const [changingPw,        setChangingPw]        = useState(false);

  // Active Sessions
  const [showSessions,      setShowSessions]      = useState(false);
  const [sessions,          setSessions]          = useState<DeviceSession[]>([]);
  const [sessionsLoading,   setSessionsLoading]   = useState(false);
  const [revokingId,        setRevokingId]        = useState<string | null>(null);

  // Disconnect Google
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  // Delete Account
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmTxt,  setDeleteConfirmTxt]  = useState("");
  const [deletingAccount,   setDeletingAccount]   = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language)!;
  const avatarLetters = (user?.full_name ?? "PA")
    .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  // ── Linked students (shared with the rest of the parent tabs) ──────────
  const { children: links, approvedChildren, isLoading: linksLoading } = useLinkedChild();
  const primaryLink = approvedChildren[0] ?? null;
  const pendingLink = links.find(l => !l.is_approved) ?? null;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    // Unregister push BEFORE clearing tokens — it needs a valid
    // Authorization header, so it has to run while the session is still live.
    try { await notificationApi.unregisterPushToken(); } catch { /* best-effort */ }
    try { await authApi.logout(); } catch { /* best-effort — clear local state regardless */ }
    await clearTokens();
    await AsyncStorage.removeItem("auth_user");
    dispatch(clearCredentials());
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data: updated } = await authApi.updateProfile({
        ...(editName ? { full_name: editName } : {}),
      });
      const token = await getAccessToken();
      await AsyncStorage.setItem("auth_user", JSON.stringify(updated));
      dispatch(setCredentials({ token: token!, user: updated }));
      setShowEditModal(false);
      Toast.show({ type: "success", text1: "Profile updated!" });
    } catch {
      Toast.show({ type: "error", text1: "Failed to save", text2: "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectLang = async (code: Lang) => {
    await setLanguage(code);
    setTimeout(() => setShowLangPanel(false), 400);
  };

  // ── Change Password ────────────────────────────────────────────────────────
  const pwChecks   = getPasswordChecks(newPw);
  const pwStrong   = isPasswordStrong(newPw);
  const pwMatch    = newPw.length > 0 && newPw === confirmPw;
  const canSubmitPw = currentPw.length > 0 && pwStrong && pwMatch && !changingPw;

  const resetChangePwForm = () => {
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setShowCurrentPw(false); setShowNewPw(false);
  };

  const handleChangePassword = async () => {
    if (!pwStrong) {
      Toast.show({ type: "error", text1: "Weak password", text2: "Please meet all password requirements." });
      return;
    }
    if (!pwMatch) {
      Toast.show({ type: "error", text1: "Passwords do not match" });
      return;
    }
    setChangingPw(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      Toast.show({ type: "success", text1: "Password changed", text2: "Please log in again on other devices." });
      resetChangePwForm();
      setShowChangePw(false);
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to change password",
        text2: err?.response?.data?.detail || "Please check your current password and try again.",
      });
    } finally {
      setChangingPw(false);
    }
  };

  // ── Active Sessions ────────────────────────────────────────────────────────
  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const { data } = await authApi.getSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      Toast.show({ type: "error", text1: "Couldn't load sessions" });
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleOpenSessions = () => {
    setShowSessions(true);
    loadSessions();
  };

  const handleRevokeSession = (sessionId: string) => {
    Alert.alert(
      "Revoke session?",
      "This device will be signed out immediately.",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            setRevokingId(sessionId);
            try {
              await authApi.revokeSession(sessionId);
              setSessions(prev => prev.filter(s => s.session_id !== sessionId));
              Toast.show({ type: "success", text1: "Session revoked" });
            } catch {
              Toast.show({ type: "error", text1: "Failed to revoke session" });
            } finally {
              setRevokingId(null);
            }
          },
        },
      ]
    );
  };

  // ── Disconnect Google ──────────────────────────────────────────────────────
  const handleDisconnectGoogle = () => {
    Alert.alert(
      "Disconnect Google?",
      "You won't be able to sign in with Google anymore. You can still sign in with your email and password.",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setDisconnectingGoogle(true);
            try {
              const { data: updated } = await authApi.disconnectGoogle();
              const token = await getAccessToken();
              await AsyncStorage.setItem("auth_user", JSON.stringify(updated));
              dispatch(setCredentials({ token: token!, user: updated }));
              Toast.show({ type: "success", text1: "Google account disconnected" });
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: "Failed to disconnect",
                text2: err?.response?.data?.detail || "Please try again.",
              });
            } finally {
              setDisconnectingGoogle(false);
            }
          },
        },
      ]
    );
  };

  // ── Delete Account ─────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirmTxt !== "DELETE") return;
    setDeletingAccount(true);
    try {
      await authApi.deleteAccount();
      setShowDeleteAccount(false);
      await clearTokens();
      await AsyncStorage.removeItem("auth_user");
      dispatch(clearCredentials());
      Toast.show({ type: "success", text1: "Account deleted", text2: "We're sorry to see you go." });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to delete account",
        text2: err?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <LinearGradient
          colors={LANG_GRADIENTS[language as Lang]}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarTxt}>{avatarLetters}</Text>
          </View>
          <Text style={styles.userName}>{user?.full_name || "Parent"}</Text>
          <Text style={styles.userEmail}>{user?.email || ""}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleTxt}>👨‍👩‍👧 Parent</Text>
          </View>
        </LinearGradient>

        {/* ── Profile ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <SettingRow
              icon="person-outline"
              label={t("editProfile")}
              onPress={() => { setEditName(user?.full_name ?? ""); setShowEditModal(true); }}
              tint={palette.primary600}
              noBorder
            />
          </View>
        </View>

        {/* ── Child Monitoring ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Child Monitoring</Text>
          <View style={styles.card}>
            {linksLoading && (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={palette.primary600} size="small" />
              </View>
            )}

            {!linksLoading && !primaryLink && !pendingLink && (
              <SettingRow
                icon="link-outline"
                label="No student linked"
                tint={palette.gray400}
                onPress={() => navigation.navigate("LinkStudent")}
                noBorder
              />
            )}

            {!linksLoading && !primaryLink && pendingLink && (
              <SettingRow
                icon="hourglass-outline"
                label={fmt(t("awaitingApprovalOf"), { name: firstNameOf(pendingLink, t("yourChild")) })}
                tint={semantic.warning.solid}
                onPress={() => navigation.navigate("LinkStudent")}
                noBorder
              />
            )}

            {!linksLoading && primaryLink && (
              <SettingRow
                icon="people-outline"
                label={fmt(t("monitoringName"), { name: primaryLink.student_name || t("yourChild") })}
                tint={accentSolid.emerald}
                onPress={() => navigation.navigate("LinkStudent")}
                noBorder={approvedChildren.length === 0}
              />
            )}

            {!linksLoading && approvedChildren.map((link, i) => (
              <View key={link.id} style={[styles.approvalRow, i === approvedChildren.length - 1 && { borderBottomWidth: 0 }]}>
                <ApprovalModeSwitch link={link} showName={approvedChildren.length > 1} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Preferences ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings")}</Text>
          <View style={styles.card}>
            {/* Notification preferences (per-event/channel matrix) */}
            <SettingRow
              icon="options-outline"
              label="Notification Preferences"
              onPress={() => navigation.navigate("ParentNotificationPrefs")}
              tint={accentSolid.amber}
            />

            {/* Communication — moved here from the Dashboard's Quick Actions
                grid, which was its only entry point before this row existed. */}
            <SettingRow
              icon="chatbox-ellipses-outline"
              label="Communication"
              onPress={() => navigation.navigate("ParentCommunication")}
              tint={accentSolid.cyan}
            />

            {/* Language Row — expands inline panel */}
            <SettingRow
              icon="language-outline"
              label={t("changeLanguage")}
              tint={accentSolid.violet}
              onPress={() => setShowLangPanel(v => !v)}
              right={
                <View style={styles.langCurrentChip}>
                  <Text style={[styles.langCurrentTxt, currentLang.dir === "rtl" && styles.rtl]}>
                    {currentLang.nativeLabel}
                  </Text>
                  <Ionicons
                    name={showLangPanel ? "chevron-up" : "chevron-down"}
                    size={13}
                    color={palette.gray500}
                    style={{ marginLeft: 2 }}
                  />
                </View>
              }
            />

            {/* Inline language options */}
            {showLangPanel && (
              <View style={styles.langPanel}>
                {LANGUAGES.map(lang => (
                  <LangOption
                    key={lang.code}
                    lang={lang}
                    selected={language === lang.code}
                    onSelect={() => handleSelectLang(lang.code as Lang)}
                  />
                ))}
              </View>
            )}

            {/* Dark mode toggle */}
            <SettingRow
              icon="moon-outline"
              label={t("darkMode")}
              tint={palette.gray600}
              noBorder
              right={
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: palette.gray200, true: palette.primary600 }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        </View>

        {/* ── Security ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.card}>
            <SettingRow
              icon="key-outline"
              label="Change Password"
              onPress={() => { resetChangePwForm(); setShowChangePw(true); }}
              tint={palette.primary600}
            />
            <SettingRow
              icon="phone-portrait-outline"
              label="Active Sessions"
              onPress={handleOpenSessions}
              tint={accentSolid.cyan}
            />
            {(user?.google_id !== null) && (
              <SettingRow
                icon="logo-google"
                label="Disconnect Google"
                onPress={handleDisconnectGoogle}
                tint={accentSolid.amber}
              />
            )}
            <SettingRow
              icon="trash-outline"
              label="Delete Account"
              onPress={() => { setDeleteConfirmTxt(""); setShowDeleteAccount(true); }}
              tint={accentSolid.rose}
              noBorder
            />
          </View>
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={palette.danger500} />
          <Text style={styles.logoutTxt}>{t("logout")}</Text>
        </TouchableOpacity>

        <Text style={styles.footerLine}>© 2026 Your Platform. All rights reserved.{"\n"}Built for the future of learning.</Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>{t("editProfile")}</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.editClose}>
                <Ionicons name="close" size={20} color={palette.gray500} />
              </TouchableOpacity>
            </View>
            <View style={styles.editField}>
              <Input
                label="Full Name"
                value={editName}
                onChangeText={setEditName}
                placeholder="Your full name"
              />
            </View>
            <Button
              label="Save Changes"
              onPress={handleSaveProfile}
              disabled={saving}
              isLoading={saving}
              fullWidth
              size="lg"
            />
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePw} animationType="slide" transparent onRequestClose={() => setShowChangePw(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePw(false)} style={styles.editClose}>
                <Ionicons name="close" size={20} color={palette.gray500} />
              </TouchableOpacity>
            </View>

            <View style={styles.editField}>
              <Text style={styles.pwFieldLabel}>Current Password</Text>
              <View style={styles.pwInputRow}>
                <TextInput
                  style={styles.pwInput}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  placeholder="Enter current password"
                  placeholderTextColor={palette.gray400}
                  secureTextEntry={!showCurrentPw}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.eyeBtnInline}>
                  <Ionicons name={showCurrentPw ? "eye-off-outline" : "eye-outline"} size={18} color={palette.gray400} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.editField}>
              <Text style={styles.pwFieldLabel}>New Password</Text>
              <View style={styles.pwInputRow}>
                <TextInput
                  style={styles.pwInput}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="Enter new password"
                  placeholderTextColor={palette.gray400}
                  secureTextEntry={!showNewPw}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.eyeBtnInline}>
                  <Ionicons name={showNewPw ? "eye-off-outline" : "eye-outline"} size={18} color={palette.gray400} />
                </TouchableOpacity>
              </View>

              {newPw.length > 0 && (
                <View style={styles.pwChecklist}>
                  {pwChecks.map(c => (
                    <View key={c.label} style={styles.pwCheckRow}>
                      <Ionicons
                        name={c.passed ? "checkmark-circle" : "ellipse-outline"}
                        size={14}
                        color={c.passed ? palette.success500 : palette.gray300}
                      />
                      <Text style={[styles.pwCheckTxt, c.passed && styles.pwCheckTxtDone]}>{c.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.editField}>
              <Text style={styles.pwFieldLabel}>Confirm New Password</Text>
              <Input
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Re-enter new password"
                secureTextEntry={!showNewPw}
                autoCapitalize="none"
              />
              {confirmPw.length > 0 && !pwMatch && (
                <Text style={styles.pwMismatchTxt}>Passwords do not match</Text>
              )}
            </View>

            <Button
              label={changingPw ? "Updating…" : "Update Password"}
              onPress={handleChangePassword}
              disabled={!canSubmitPw}
              isLoading={changingPw}
              fullWidth
              size="lg"
            />
          </View>
        </View>
      </Modal>

      {/* Active Sessions Modal */}
      <Modal visible={showSessions} animationType="slide" transparent onRequestClose={() => setShowSessions(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.editModal, styles.sessionsModal]}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Active Sessions</Text>
              <TouchableOpacity onPress={() => setShowSessions(false)} style={styles.editClose}>
                <Ionicons name="close" size={20} color={palette.gray500} />
              </TouchableOpacity>
            </View>

            {sessionsLoading && (
              <ActivityIndicator color={palette.primary600} style={{ marginVertical: 24 }} />
            )}

            {!sessionsLoading && sessions.length === 0 && (
              <View style={styles.sessionsEmpty}>
                <Ionicons name="phone-portrait-outline" size={40} color={palette.gray300} />
                <Text style={styles.sessionsEmptyTxt}>No active sessions found</Text>
              </View>
            )}

            {!sessionsLoading && sessions.length > 0 && (
              <ScrollView style={styles.sessionsList} showsVerticalScrollIndicator={false}>
                {sessions.map(s => (
                  <View key={s.session_id} style={styles.sessionRow}>
                    <View style={[styles.sessionIcon, { backgroundColor: palette.primary600 }]}>
                      <Ionicons name={deviceIcon(s.device_type) as any} size={18} color="#fff" />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionDevice}>
                        {[s.os, s.browser].filter(Boolean).join(" · ") || s.device_type || "Unknown device"}
                      </Text>
                      <Text style={styles.sessionMeta}>
                        {(s.ip_address || "Unknown location")} · {formatSessionTime(s.last_seen)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRevokeSession(s.session_id)}
                      disabled={revokingId === s.session_id}
                      style={styles.revokeBtn}
                      activeOpacity={0.75}
                    >
                      {revokingId === s.session_id
                        ? <ActivityIndicator color={palette.danger500} size="small" />
                        : <Text style={styles.revokeBtnTxt}>Revoke</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteAccount} animationType="slide" transparent onRequestClose={() => setShowDeleteAccount(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <View style={styles.editHeader}>
              <Text style={[styles.editTitle, { color: palette.danger500 }]}>Delete Account</Text>
              <TouchableOpacity onPress={() => setShowDeleteAccount(false)} style={styles.editClose}>
                <Ionicons name="close" size={20} color={palette.gray500} />
              </TouchableOpacity>
            </View>

            <View style={styles.dangerBox}>
              <Ionicons name="warning-outline" size={18} color={palette.danger500} />
              <Text style={styles.dangerBoxTxt}>
                This will permanently delete your account and all associated data. This action cannot be undone.
              </Text>
            </View>

            <View style={styles.editField}>
              <Text style={styles.pwFieldLabel}>
                Type <Text style={{ fontWeight: "800", color: palette.danger500 }}>DELETE</Text> to confirm
              </Text>
              <Input
                value={deleteConfirmTxt}
                onChangeText={setDeleteConfirmTxt}
                placeholder="DELETE"
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <Button
              label={deletingAccount ? "Deleting…" : "Delete My Account"}
              onPress={handleDeleteAccount}
              disabled={deleteConfirmTxt !== "DELETE" || deletingAccount}
              isLoading={deletingAccount}
              variant="danger"
              fullWidth
              size="lg"
            />
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={showLogoutConfirm}
        variant="destructive"
        title={t("logout")}
        message="Are you sure you want to log out?"
        confirmLabel={t("logout")}
        cancelLabel={t("cancel")}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: palette.gray50 },

  // Header
  header:           { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl },
  backBtn:          { alignSelf: "flex-start", width: 36, height: 36, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  avatarCircle:     { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarTxt:        { color: "#fff", fontSize: typography.h1.fontSize, fontWeight: "800" },
  userName:         { color: "#fff", fontSize: typography.h3.fontSize, fontWeight: "800" },
  userEmail:        { color: "rgba(255,255,255,0.75)", fontSize: typography.bodySm.fontSize, marginTop: spacing.xs },
  roleBadge:        { marginTop: spacing.sm, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  roleTxt:          { color: "#fff", fontSize: typography.bodySm.fontSize, fontWeight: "600" },

  // Section
  section:          { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle:     { fontSize: typography.bodyMedium.fontSize, fontWeight: "700", color: palette.gray900, marginBottom: spacing.sm },
  helperTxt:        { fontSize: typography.caption.fontSize, color: palette.gray400, marginTop: spacing.sm, lineHeight: 16, paddingHorizontal: spacing.xs },

  // Card
  card:             { backgroundColor: "#fff", borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  settingRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, minHeight: 44, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  settingIcon:      { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  settingLabel:     { flex: 1, fontSize: typography.bodySm.fontSize, color: palette.gray700, fontWeight: "500" },
  settingRight:     { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  settingValue:     { fontSize: typography.bodySm.fontSize, color: palette.gray400 },
  inlineLoading:    { alignItems: "center", paddingVertical: spacing.xl },
  approvalRow:      { paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.gray100 },

  // Language current chip (shown in row)
  langCurrentChip:  { flexDirection: "row", alignItems: "center", backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  langCurrentTxt:   { fontSize: typography.bodySm.fontSize, color: palette.primary600, fontWeight: "600" },
  rtl:              { textAlign: "right", writingDirection: "rtl" },

  // Inline language panel
  langPanel:        { backgroundColor: palette.gray50, paddingVertical: spacing.sm },
  langOption:       { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minHeight: 44 },
  langOptionActive: { backgroundColor: palette.primary50 },
  langFlag:         { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  langFlagTxt:      { color: "#fff", fontSize: typography.h4.fontSize, fontWeight: "800" },
  langInfo:         { flex: 1 },
  langNative:       { fontSize: typography.h4.fontSize, fontWeight: "700", color: palette.gray900 },
  langEng:          { fontSize: typography.caption.fontSize, color: palette.gray400, marginTop: 1 },
  checkCircle:      { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },

  // Logout
  logoutBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", marginHorizontal: spacing.lg, marginTop: spacing.xl, minHeight: 44, backgroundColor: palette.danger50, borderRadius: radius.lg, paddingVertical: spacing.lg, gap: spacing.sm },
  logoutTxt:        { fontSize: typography.bodyMedium.fontSize, fontWeight: "700", color: palette.danger500 },
  footerLine:       { fontSize: typography.caption.fontSize, color: palette.gray400, textAlign: "center", marginTop: spacing.lg + 2, lineHeight: 16 },

  // Edit Profile Modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  editModal:        { backgroundColor: "#fff", borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, padding: spacing["2xl"], paddingBottom: spacing["4xl"] },
  editHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl },
  editTitle:        { fontSize: typography.h3.fontSize, fontWeight: "800", color: palette.gray900 },
  editClose:        { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  editField:        { marginBottom: spacing.md + 2 },

  // Change Password Modal
  pwFieldLabel:     { fontSize: 12, fontWeight: "600", color: palette.gray700, marginBottom: 6 },
  pwInputRow:       { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: 12, paddingHorizontal: 14 },
  pwInput:          { flex: 1, height: 46, fontSize: 15, color: palette.gray900 },
  eyeBtnInline:     { padding: 4 },
  pwChecklist:      { marginTop: 10, gap: 6 },
  pwCheckRow:       { flexDirection: "row", alignItems: "center", gap: 6 },
  pwCheckTxt:       { fontSize: 12, color: palette.gray400 },
  pwCheckTxtDone:   { color: palette.success500, fontWeight: "600" },
  pwMismatchTxt:    { fontSize: 11, color: palette.danger500, marginTop: 6 },

  // Active Sessions Modal
  sessionsModal:    { maxHeight: "80%" },
  sessionsList:     { maxHeight: 420 },
  sessionsEmpty:    { alignItems: "center", paddingVertical: 32, gap: 10 },
  sessionsEmptyTxt: { fontSize: 13, color: palette.gray400 },
  sessionRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.gray100, gap: 12 },
  sessionIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sessionInfo:      { flex: 1 },
  sessionDevice:    { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  sessionMeta:      { fontSize: 11, color: palette.gray400, marginTop: 2 },
  revokeBtn:        { backgroundColor: semantic.danger.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  revokeBtnTxt:     { fontSize: 12, fontWeight: "700", color: palette.danger500 },

  // Delete Account Modal
  dangerBox:        { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: semantic.danger.bg, borderWidth: 1, borderColor: palette.danger100, borderRadius: 12, padding: 12, marginBottom: 16 },
  dangerBoxTxt:     { flex: 1, fontSize: 12, color: semantic.danger.text, lineHeight: 18 },
});
