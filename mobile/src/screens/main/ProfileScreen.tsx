import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Switch, Alert, TextInput,
  Modal, ActivityIndicator, Image, Platform, Clipboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { fmt } from "@/i18n/format";
import { formatDayMonYear } from "@/utils/dates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { useAppDispatch, useAppSelector } from "@/store";
import { clearCredentials, setCredentials } from "@/store/authSlice";
import { useLanguage } from "@/contexts/LanguageContext";
import { authApi, type DeviceSession } from "@/api/auth";
import { getAccessToken, clearTokens } from "@/api/secureStorage";
import { notificationApi } from "@/api/notification";
import { getLevelInfo, getRankUnlock, getStreak, getUserBadges } from "@/api/gamification";
import { analyticsApi } from "@/api/analytics";
import { parentApi } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import client from "@/api/client";
import { contentApi } from "@/api/content";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import InfoModal from "@/components/info/InfoModal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { palette, semantic, accentSolid, cardShadow } from "@/theme/colors";

// ── solid colors per language (kept two-tone per language for visual
// distinction in the language switcher; the English entry was previously a
// same-hue indigo gradient so it collapses to one flat token, others are
// distinct non-brand hues so they don't conflict with the primary accent) ──
const LANG_COLORS: Record<Lang, string> = {
  en: palette.primary600,
  hi: palette.danger600,
  pa: palette.success600,
  ur: accentSolid.rose,
};

// Icon/tint per real badge type — services/gamification_service's BADGE_META
// is the source of truth for name/description; this is purely cosmetic
// styling layered on real earned-badge data fetched via getUserBadges below.
const BADGE_STYLE: Record<string, { icon: string; tint: string }> = {
  first_video:       { icon: "play-circle",  tint: palette.primary600 },
  quiz_ace:          { icon: "star",         tint: palette.primary600 },
  streak_7:          { icon: "flame",        tint: accentSolid.amber },
  streak_30:         { icon: "flame",        tint: accentSolid.amber },
  chapter_complete:  { icon: "book",         tint: palette.primary600 },
  subject_complete:  { icon: "school",       tint: palette.primary600 },
  referral_champion: { icon: "gift",         tint: accentSolid.rose },
  premium_member:    { icon: "diamond",      tint: accentSolid.rose },
  battle_champion:   { icon: "trophy",       tint: accentSolid.rose },
  quiz_warrior:      { icon: "star",         tint: palette.primary600 },
  top_performer:     { icon: "trophy",       tint: accentSolid.rose },
  win_streak_5:      { icon: "flame",        tint: accentSolid.amber },
  level_5:           { icon: "ribbon",       tint: palette.primary600 },
  level_10:          { icon: "ribbon",       tint: palette.primary600 },
  elite_learner:     { icon: "ribbon",       tint: palette.primary600 },
};
const DEFAULT_BADGE_STYLE = { icon: "medal", tint: palette.primary600 };

interface ParentLink {
  id: string;
  parent_user_id: string;
  relationship: string;
  parent_name: string | null;
  is_approved: boolean;
  approved_at?: string | null;
  created_at: string;
}

// ── Password strength (mirrors backend rule: 8+ chars, 1 uppercase, 1 digit) ──
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

// ── Reusable setting row ──────────────────────────────────────────────────────
interface RowProps {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  tint?: string;
  right?: React.ReactNode;
  noBorder?: boolean;
}
function SettingRow({ icon, label, value, onPress, tint = palette.primary600, right, noBorder }: RowProps) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, noBorder && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.65 : 1}
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

// ── Language Option Row ────────────────────────────────────────────────────────
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
      <View
        style={[styles.langFlag, { backgroundColor: LANG_COLORS[lang.code as Lang] }]}
      >
        <Text style={styles.langFlagTxt}>{lang.script.slice(0, 1)}</Text>
      </View>
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
export default function ProfileScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const { t, language, setLanguage } = useLanguage();
  const user = useAppSelector(s => s.auth.user);

  const [uploadingAvatar,   setUploadingAvatar]   = useState(false);
  const [avatarBroken,      setAvatarBroken]      = useState(false);

  // Real stats-strip data (XP, rank, streak) and earned badges — previously
  // hardcoded constants shown as if live for every user; now fetched per-user
  // from gamification_service the same way DashboardScreen already does.
  const [stats, setStats] = useState({ xp: 0, rank: null as number | null, streakDays: 0, quizzesDone: 0 });
  const [earnedBadges, setEarnedBadges] = useState<{ type: string; name: string }[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [levelRes, rankRes, streakRes, badgesRes, dashRes] = await Promise.all([
          getLevelInfo(user.id).catch(() => null),
          getRankUnlock(user.id).catch(() => null),
          getStreak(user.id).catch(() => null),
          getUserBadges(user.id).catch(() => null),
          analyticsApi.dashboard(user.id).catch(() => null),
        ]);
        if (cancelled) return;
        setStats({
          xp: rankRes?.data?.total_xp ?? levelRes?.data?.total_xp ?? 0,
          rank: rankRes?.data?.rank ?? null,
          streakDays: streakRes?.data?.current ?? 0,
          quizzesDone: dashRes?.data?.total_quizzes_completed ?? dashRes?.data?.quizzes_completed ?? 0,
        });
        setEarnedBadges(Array.isArray(badgesRes?.data) ? badgesRes.data : []);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Parents link a child's account via "Link a Student", which needs the
  // student's exact user id — with nowhere on the student's own profile
  // showing it, a parent had no way to find it at all.
  const copyStudentId = () => {
    if (!user?.id) return;
    Clipboard.setString(user.id);
    Toast.show({ type: "success", text1: "Student ID copied!" });
  };

  // Pending parent-link requests — a parent linking to this account creates
  // the link as is_approved=false server-side and it grants that parent NO
  // access (dashboard, monitoring, AI chat about this student) until
  // approved here. Without this screen the approval step was simply
  // unreachable on mobile: parents could request a link but nothing ever
  // let the student grant it.
  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);
  const [respondingLinkId, setRespondingLinkId] = useState<string | null>(null);
  const isStudentAccount = user?.role?.toLowerCase() === "student";

  const loadParentLinks = async () => {
    if (!user?.id || !isStudentAccount) return;
    try {
      const r = await parentApi.getParentLinks(user.id);
      setParentLinks(Array.isArray(r.data) ? r.data : []);
    } catch {
      // Non-fatal — the section simply won't show if this fails.
    }
  };

  useEffect(() => {
    loadParentLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadParentLinks();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, isStudentAccount])
  );

  const pendingParentLinks = parentLinks.filter((l) => !l.is_approved);
  const approvedParentLinks = parentLinks.filter((l) => l.is_approved);

  const respondToParentLink = async (linkId: string, approve: boolean) => {
    setRespondingLinkId(linkId);
    const parentName = parentLinks.find((l) => l.id === linkId)?.parent_name ?? t("yourParent");
    try {
      if (approve) {
        await parentApi.updateLink(linkId, { is_approved: true });
        Toast.show({
          type: "success",
          text1: t("approvedToast"),
          text2: fmt(t("parentCanNowSee"), { name: parentName }),
        });
      } else {
        await parentApi.removeLink(linkId);
        Toast.show({ type: "success", text1: t("requestRejected") });
      }
      await loadParentLinks();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: approve ? t("couldNotApprove") : t("couldNotReject"),
        text2: errorDetail(err, t("pleaseTryAgain")),
      });
    } finally {
      setRespondingLinkId(null);
    }
  };

  // Profile photo upload. On web (the dev/default runtime) a DOM file input
  // is used; the image is stored server-side (user_service) and mirrored to
  // the auth profile, so it shows in chat, battles and leaderboards for everyone.
  const uploadAvatarFile = async (file: any) => {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await client.post("/v1/users/profile/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = r.data?.avatar_url;
      const { data: updated } = await authApi.updateProfile({ avatar_url: url });
      const token = await getAccessToken();
      dispatch(setCredentials({ token: token!, user: updated }));
      await AsyncStorage.setItem("auth_user", JSON.stringify(updated));
      setAvatarBroken(false);
      Toast.show({ type: "success", text1: "Profile photo updated!", text2: "Now visible in chat, battles & leaderboards." });
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Upload failed",
        text2: e?.response?.data?.detail || "Use a JPEG/PNG under 2 MB.",
      });
    } finally { setUploadingAvatar(false); }
  };

  const handlePickAvatar = async () => {
    if (uploadingAvatar) return;
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          Toast.show({ type: "error", text1: "Image too large", text2: "Keep it under 2 MB." });
          return;
        }
        uploadAvatarFile(file);
      };
      input.click();
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.show({ type: "error", text1: "Permission needed", text2: "Allow photo access in Settings to change your profile picture." });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      Toast.show({ type: "error", text1: "Image too large", text2: "Keep it under 2 MB." });
      return;
    }
    const filename = asset.uri.split("/").pop() || "avatar.jpg";
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    uploadAvatarFile({ uri: asset.uri, name: filename, type: mimeType } as any);
  };

  const [darkMode,          setDarkMode]          = useState(false);
  const [notifs,            setNotifs]            = useState(true);
  const [showLangPanel,     setShowLangPanel]     = useState(false);
  const [infoSlug,          setInfoSlug]          = useState<string | null>(null);
  const [showEditModal,     setShowEditModal]     = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [editName,          setEditName]          = useState(user?.full_name ?? "");
  const [editSchool,        setEditSchool]        = useState(user?.school_name ?? "");
  const [editBoard,         setEditBoard]         = useState("");
  const [editClass,         setEditClass]         = useState<number | null>(null);
  const [profileMeta,       setProfileMeta]       = useState<any>(null); // board/class + change-limit info
  const [saving,            setSaving]            = useState(false);

  // Load the user profile when opening the edit modal — board/class/school
  // live there, along with the curriculum-change allowance.
  useEffect(() => {
    if (!showEditModal || !user?.id) return;
    client.get(`/v1/users/profile/${user.id}`)
      .then((r: any) => {
        setProfileMeta(r.data);
        setEditBoard(r.data?.board ?? "");
        setEditClass(r.data?.class_number ?? null);
        if (r.data?.school_name) setEditSchool(r.data.school_name);
      })
      .catch(() => setProfileMeta(null));
  }, [showEditModal, user?.id]);

  // Board / class chips come from the content service (what the admin
  // created) instead of a hardcoded list. Falls back to the old static
  // options only if the content service can't be reached.
  const [editBoards,  setEditBoards]  = useState<{ id: string; name: string; code?: string }[]>([]);
  const [editClasses, setEditClasses] = useState<number[]>([]);
  useEffect(() => {
    if (!showEditModal) return;
    contentApi.getBoards()
      .then((r: any) => setEditBoards(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEditBoards(["CBSE", "ICSE", "HBSE", "State Board"].map((n) => ({ id: n, name: n }))));
  }, [showEditModal]);
  const editBoardId = editBoards.find((b) => b.name === editBoard || b.code === editBoard)?.id;
  useEffect(() => {
    if (!showEditModal || !editBoardId) { setEditClasses([]); return; }
    contentApi.getClasses(editBoardId)
      .then((r: any) => {
        const rows: any[] = Array.isArray(r.data) ? r.data : [];
        setEditClasses([...new Set(rows.map((c) => Number(c.number)))].sort((a, b) => a - b));
      })
      .catch(() => setEditClasses(Array.from({ length: 12 }, (_, i) => i + 1)));
  }, [showEditModal, editBoardId]);

  // ── Security section state ─────────────────────────────────────────────────
  const [showChangePw,      setShowChangePw]      = useState(false);
  const [currentPw,         setCurrentPw]         = useState("");
  const [newPw,             setNewPw]             = useState("");
  const [confirmPw,         setConfirmPw]         = useState("");
  const [showCurrentPw,     setShowCurrentPw]     = useState(false);
  const [showNewPw,         setShowNewPw]         = useState(false);
  const [changingPw,        setChangingPw]        = useState(false);

  const [showSessions,      setShowSessions]      = useState(false);
  const [sessions,          setSessions]          = useState<DeviceSession[]>([]);
  const [sessionsLoading,   setSessionsLoading]   = useState(false);
  const [revokingId,        setRevokingId]        = useState<string | null>(null);

  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmTxt,  setDeleteConfirmTxt]  = useState("");
  const [deletingAccount,   setDeletingAccount]   = useState(false);

  const currentLang  = LANGUAGES.find(l => l.code === language)!;
  const avatarLetters = (user?.full_name ?? "ST")
    .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

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
    // Switching board clears the class (classes differ per board) — don't
    // save a new board with the old board's class.
    if (editBoard && !editClass) {
      Toast.show({ type: "error", text1: "Select your class", text2: "Pick a class for the selected board." });
      return;
    }
    setSaving(true);
    try {
      // PATCH the user profile first — board/class/school go through the
      // server-enforced curriculum-change limit (3 changes, then 90-day lock).
      await client.patch(`/v1/users/profile/${user!.id}`, {
        ...(editName  ? { full_name: editName } : {}),
        ...(editSchool ? { school_name: editSchool } : {}),
        ...(editBoard ? { board: editBoard } : {}),
        ...(editClass ? { class_number: editClass } : {}),
      });
      const { data: updated } = await authApi.updateProfile({
        ...(editName   ? { full_name:   editName   } : {}),
        ...(editSchool !== undefined ? { school_name: editSchool || undefined } : {}),
      });
      const token = await getAccessToken();
      await AsyncStorage.setItem("auth_user", JSON.stringify(updated));
      dispatch(setCredentials({ token: token!, user: updated }));
      setShowEditModal(false);
      Toast.show({ type: "success", text1: "Profile updated!" });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Toast.show({
        type: "error",
        text1: e?.response?.status === 423 ? "Changes locked" : "Failed to save",
        text2: typeof detail === "string" ? detail : "Please try again.",
        visibilityTime: 6000,
      });
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

        {/* ── Profile Header ── */}
        <View
          style={[styles.header, { backgroundColor: LANG_COLORS[language as Lang] }]}
        >
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} activeOpacity={0.8}>
            {user?.avatar_url && !avatarBroken ? (
              <Image
                source={{ uri: user.avatar_url }}
                style={styles.avatarImg}
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarTxt}>{avatarLetters}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color={palette.primary600} />
                : <Ionicons name="camera" size={14} color={palette.primary600} />}
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.full_name || "Student"}</Text>
          <Text style={styles.userEmail}>{user?.email || ""}</Text>
          {user?.school_name && (
            <Text style={styles.userSchool}>{user.school_name}</Text>
          )}
          <View style={styles.roleBadge}>
            <Text style={styles.roleTxt}>
              {user?.role === "student" ? "🎓 Student"
               : user?.role === "parent" ? "👨‍👩‍👧 Parent"
               : "⚙️ Admin"}
            </Text>
          </View>
        </View>

        {/* ── Stats strip ── */}
        <View style={styles.statsStrip}>
          {[
            { label: "XP",      value: statsLoading ? "—" : stats.xp.toLocaleString() },
            { label: t("leaderboard").slice(0, 4), value: statsLoading ? "—" : (stats.rank != null ? `#${stats.rank}` : "—") },
            { label: t("streak"), value: statsLoading ? "—" : `${stats.streakDays}d` },
            { label: t("quizzesDone").split(" ")[0], value: statsLoading ? "—" : String(stats.quizzesDone) },
          ].map(s => (
            <View key={s.label} style={styles.statsItem}>
              <Text style={styles.statsValue}>{s.value}</Text>
              <Text style={styles.statsLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Badges — only actually-earned badges, honest empty state otherwise ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Badges</Text>
          {earnedBadges.length > 0 ? (
            <View style={styles.badgeRow}>
              {earnedBadges.map((b) => {
                const style = BADGE_STYLE[b.type] ?? DEFAULT_BADGE_STYLE;
                return (
                  <View key={b.type} style={styles.badge}>
                    <View style={[styles.badgeIconBadge, { backgroundColor: style.tint }]}>
                      <Ionicons name={style.icon as any} size={18} color="#fff" />
                    </View>
                    <Text style={styles.badgeLabel}>{b.name}</Text>
                  </View>
                );
              })}
            </View>
          ) : !statsLoading && (
            <Text style={styles.badgeEmptyTxt}>Complete quizzes, videos and streaks to earn your first badge!</Text>
          )}
        </View>

        {/* ── Student ID — share with a parent so they can link this account ── */}
        {user?.role === "student" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Student ID</Text>
            <View style={styles.studentIdCard}>
              <Text style={styles.studentIdHint}>Share this with your parent so they can link your account.</Text>
              <View style={styles.studentIdRow}>
                <Text style={styles.studentIdTxt} numberOfLines={1} ellipsizeMode="middle">{user?.id}</Text>
                <TouchableOpacity onPress={copyStudentId} style={styles.studentIdCopyBtn} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={14} color={palette.primary600} />
                  <Text style={styles.studentIdCopyTxt}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Linked parents (read-only) + pending parent-link requests ── */}
        {isStudentAccount && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("linkedParents")}</Text>
            <View style={styles.studentIdCard}>
              <Text style={styles.studentIdHint}>
                {parentLinks.length === 0 ? t("noParentLinkedHint") : t("approvingLetsParent")}
              </Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                {approvedParentLinks.map((link) => {
                  const since = formatDayMonYear(link.approved_at);
                  return (
                    <View key={link.id} style={styles.parentLinkRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.parentLinkName} numberOfLines={1}>{link.parent_name ?? t("aParent")}</Text>
                        <Text style={styles.parentLinkMeta} numberOfLines={1}>{link.relationship}</Text>
                        {!!since && (
                          <Text style={styles.parentLinkMeta} numberOfLines={1}>{fmt(t("linkedSince"), { date: since })}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => navigation.navigate("StudentParentChat")}
                        style={styles.parentLinkMessageBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={14} color={palette.primary600} />
                        <Text style={styles.parentLinkMessageTxt}>{t("messages")}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {pendingParentLinks.map((link) => (
                  <View key={link.id} style={styles.parentLinkRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.parentLinkName} numberOfLines={1}>{link.parent_name ?? t("aParent")}</Text>
                      <Text style={styles.parentLinkMeta} numberOfLines={1}>{link.relationship}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, flexShrink: 0 }}>
                      <TouchableOpacity
                        style={styles.parentLinkRejectBtn}
                        disabled={respondingLinkId === link.id}
                        onPress={() => respondToParentLink(link.id, false)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.parentLinkRejectTxt}>{t("reject")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.parentLinkApproveBtn}
                        disabled={respondingLinkId === link.id}
                        onPress={() => respondToParentLink(link.id, true)}
                        activeOpacity={0.8}
                      >
                        {respondingLinkId === link.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.parentLinkApproveTxt}>{t("approve")}</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings")}</Text>
          <View style={styles.card}>
            <SettingRow
              icon="person-outline"
              label={t("editProfile")}
              onPress={() => { setEditName(user?.full_name ?? ""); setEditSchool(user?.school_name ?? ""); setShowEditModal(true); }}
              tint={palette.primary600}
            />
            <SettingRow
              icon="diamond-outline"
              label="Subscription & Plans"
              onPress={() => navigation.navigate("Subscription")}
              tint={palette.primary600}
            />
            <SettingRow
              icon="gift-outline"
              label="Refer & Earn"
              onPress={() => navigation.navigate("Referral")}
              tint={accentSolid.amber}
            />

            {/* Language Row — expands inline panel */}
            <SettingRow
              icon="language-outline"
              label={t("changeLanguage")}
              tint={accentSolid.fuchsia}
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

            {/* Notifications toggle */}
            <SettingRow
              icon="notifications-outline"
              label={t("notifications")}
              tint={accentSolid.amber}
              right={
                <Switch
                  value={notifs}
                  onValueChange={setNotifs}
                  trackColor={{ false: palette.gray200, true: palette.primary600 }}
                  thumbColor="#fff"
                />
              }
            />

            {/* Notification preferences (per-event/channel matrix) */}
            <SettingRow
              icon="options-outline"
              label="Notification Preferences"
              onPress={() => navigation.navigate("NotificationPreferences")}
              tint={accentSolid.rose}
            />

            {/* EduPoints shop, history & streak freeze */}
            <SettingRow
              icon="storefront-outline"
              label="EduPoints Shop"
              onPress={() => navigation.navigate("EduPointsShop")}
              tint={accentSolid.amber}
            />

            {/* Weekly progress report */}
            <SettingRow
              icon="bar-chart-outline"
              label="Weekly Report"
              onPress={() => navigation.navigate("WeeklyReport")}
              tint={accentSolid.cyan}
            />

            {/* Saved videos & notes */}
            <SettingRow
              icon="bookmark-outline"
              label="Saved for Later"
              onPress={() => navigation.navigate("Saved")}
              tint={palette.primary600}
            />

            {/* Send feedback */}
            <SettingRow
              icon="chatbox-ellipses-outline"
              label="Send Feedback"
              onPress={() => navigation.navigate("Feedback")}
              tint={accentSolid.emerald}
            />

            {/* Dark mode toggle */}
            <SettingRow
              icon="moon-outline"
              label={t("darkMode")}
              tint={accentSolid.teal}
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

        {/* ── Information (admin-editable CMS pages) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.card}>
            <SettingRow icon="information-circle-outline" label="About Us"           onPress={() => setInfoSlug("about-us")}       tint={palette.primary600}  />
            <SettingRow icon="mail-outline"               label="Contact Us"         onPress={() => setInfoSlug("contact-us")}     tint={accentSolid.cyan}    />
            <SettingRow icon="help-circle-outline"        label="FAQ"                onPress={() => setInfoSlug("faq")}            tint={accentSolid.amber}   />
            <SettingRow icon="shield-checkmark-outline"   label="Privacy Policy"     onPress={() => setInfoSlug("privacy-policy")} tint={palette.primary600}  />
            <SettingRow icon="document-text-outline"      label="Terms & Conditions" onPress={() => setInfoSlug("terms")}          tint={accentSolid.fuchsia} />
            <SettingRow icon="refresh-outline"            label="Refund Policy"      onPress={() => setInfoSlug("refund-policy")}  tint={accentSolid.emerald} />
            <SettingRow icon="code-slash-outline"         label={t("version")}       value="1.0.0" noBorder />
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
              <Text style={styles.editLabel}>Full Name</Text>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your full name"
                placeholderTextColor={palette.gray400}
              />
            </View>
            <View style={styles.editField}>
              <Text style={styles.editLabel}>School Name</Text>
              <TextInput
                style={styles.editInput}
                value={editSchool}
                onChangeText={setEditSchool}
                placeholder="e.g. Delhi Public School"
                placeholderTextColor={palette.gray400}
              />
            </View>

            {/* Curriculum warning — server enforces the limit */}
            {profileMeta?.curriculum_locked_until && new Date(profileMeta.curriculum_locked_until) > new Date() ? (
              <View style={[styles.editWarn, { backgroundColor: semantic.danger.bg, borderColor: palette.danger100 }]}>
                <Text style={[styles.editWarnTxt, { color: semantic.danger.text }]}>
                  🔒 Board, Class & School are locked until {new Date(profileMeta.curriculum_locked_until).toLocaleDateString()}.
                </Text>
              </View>
            ) : (
              <View style={styles.editWarn}>
                <Text style={styles.editWarnTxt}>
                  ⚠️ Board, Class & School can only be changed {Math.max(0, 3 - (profileMeta?.curriculum_changes_count ?? 0))} more time(s) — then locked for 3 months. All your subjects follow these settings.
                </Text>
              </View>
            )}

            <View style={styles.editField}>
              <Text style={styles.editLabel}>Board</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {editBoards.map(({ id, name: b }) => (
                  <TouchableOpacity key={id}
                    style={[styles.editChip, editBoard === b && styles.editChipOn]}
                    onPress={() => { if (editBoard !== b) { setEditBoard(b); setEditClass(null); } }}>
                    <Text style={[styles.editChipTxt, editBoard === b && styles.editChipTxtOn]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.editField}>
              <Text style={styles.editLabel}>Class</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {editBoardId && editClasses.length === 0 && (
                  <Text style={styles.editChipTxt}>No classes available for this board</Text>
                )}
                {editClasses.map((n) => (
                  <TouchableOpacity key={n}
                    style={[styles.editChip, editClass === n && styles.editChipOn]}
                    onPress={() => setEditClass(n)}>
                    <Text style={[styles.editChipTxt, editClass === n && styles.editChipTxtOn]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
              <View style={[styles.saveBtn, { backgroundColor: saving ? palette.primary300 : palette.primary600 }]}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnTxt}>Save Changes</Text>
                }
              </View>
            </TouchableOpacity>
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
              <Text style={styles.editLabel}>Current Password</Text>
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
              <Text style={styles.editLabel}>New Password</Text>
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

              {/* Strength checklist */}
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
              <Text style={styles.editLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.editInput}
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Re-enter new password"
                placeholderTextColor={palette.gray400}
                secureTextEntry={!showNewPw}
                autoCapitalize="none"
              />
              {confirmPw.length > 0 && !pwMatch && (
                <Text style={styles.pwMismatchTxt}>Passwords do not match</Text>
              )}
            </View>

            <TouchableOpacity onPress={handleChangePassword} disabled={!canSubmitPw} activeOpacity={0.85}>
              <View
                style={[styles.saveBtn, { backgroundColor: !canSubmitPw ? palette.primary300 : palette.primary600 }]}
              >
                {changingPw
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnTxt}>Update Password</Text>
                }
              </View>
            </TouchableOpacity>
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
              <Text style={styles.editLabel}>
                Type <Text style={{ fontWeight: "800", color: palette.danger500 }}>DELETE</Text> to confirm
              </Text>
              <TextInput
                style={styles.editInput}
                value={deleteConfirmTxt}
                onChangeText={setDeleteConfirmTxt}
                placeholder="DELETE"
                placeholderTextColor={palette.gray400}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={deleteConfirmTxt !== "DELETE" || deletingAccount}
              activeOpacity={0.85}
            >
              <View
                style={[styles.deleteBtn, { backgroundColor: (deleteConfirmTxt !== "DELETE" || deletingAccount) ? palette.danger100 : palette.danger600 }]}
              >
                {deletingAccount
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnTxt}>Delete My Account</Text>
                }
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dynamic CMS info pages (About/Contact/FAQ/Privacy/Terms/Refund) */}
      <InfoModal slug={infoSlug} onClose={() => setInfoSlug(null)} />


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
  header:           { alignItems: "center", paddingTop: 20, paddingBottom: 32, paddingHorizontal: 20 },
  avatarCircle:     { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  avatarWrap:       { marginBottom: 12, position: "relative" },
  avatarImg:        { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  avatarEditBadge:  { position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
  editWarn:         { backgroundColor: semantic.warning.bg, borderWidth: 1, borderColor: palette.warning100, borderRadius: 10, padding: 10, marginBottom: 12 },
  editWarnTxt:      { fontSize: 12, fontWeight: "700", color: semantic.warning.text, lineHeight: 17 },
  editChip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.gray100, borderWidth: 1.5, borderColor: palette.gray200 },
  editChipOn:       { backgroundColor: palette.primary50, borderColor: palette.primary600 },
  editChipTxt:      { fontSize: 13, fontWeight: "600", color: palette.gray500 },
  editChipTxtOn:    { color: palette.primary600, fontWeight: "800" },
  avatarTxt:        { color: "#fff", fontSize: 24, fontWeight: "800" },
  userName:         { color: "#fff", fontSize: 17, fontWeight: "800" },
  userEmail:        { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 4 },
  userSchool:       { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },
  roleBadge:        { marginTop: 8, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  roleTxt:          { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Stats
  statsStrip:       { flexDirection: "row", backgroundColor: "#fff", marginTop: -16, marginHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.gray100, paddingVertical: 16, ...cardShadow },
  statsItem:        { flex: 1, alignItems: "center" },
  statsValue:       { fontSize: 16, fontWeight: "800", color: palette.primary600 },
  statsLabel:       { fontSize: 10, color: palette.gray500, marginTop: 1 },

  // Section
  section:          { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle:     { fontSize: 14, fontWeight: "800", color: palette.gray900, marginBottom: 8 },

  // Badges
  badgeRow:         { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge:            { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  badgeIconBadge:   { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  badgeLabel:       { fontSize: 12, fontWeight: "700", color: palette.gray700 },
  badgeEmptyTxt:    { fontSize: 13, color: palette.gray400, fontStyle: "italic" },

  // Student ID
  studentIdCard:    { backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  studentIdHint:    { fontSize: 12, color: palette.gray500, marginBottom: 10 },
  studentIdRow:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.gray50, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  studentIdTxt:     { flex: 1, fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: palette.gray800 },
  studentIdCopyBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.primary50, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  studentIdCopyTxt: { fontSize: 12, fontWeight: "700", color: palette.primary600 },

  // Parent link requests
  parentLinkRow:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.gray50, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  parentLinkName:       { fontSize: 13, fontWeight: "700", color: palette.gray800 },
  parentLinkMeta:       { fontSize: 11, color: palette.gray500, textTransform: "capitalize", marginTop: 1 },
  parentLinkRejectBtn:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.gray100, minHeight: 34, justifyContent: "center" },
  parentLinkRejectTxt:  { fontSize: 12, fontWeight: "700", color: palette.gray600 },
  parentLinkApproveBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.primary600, minHeight: 34, justifyContent: "center", minWidth: 68, alignItems: "center" },
  parentLinkApproveTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },
  parentLinkLinkedTxt:  { fontSize: 12, fontWeight: "700", color: palette.success600, flexShrink: 0 },
  parentLinkMessageBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.primary50, flexShrink: 0 },
  parentLinkMessageTxt: { fontSize: 12, fontWeight: "700", color: palette.primary600 },

  // Card
  card:             { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  settingRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  settingIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  settingLabel:     { flex: 1, fontSize: 13, color: palette.gray700, fontWeight: "500" },
  settingRight:     { flexDirection: "row", alignItems: "center", gap: 4 },
  settingValue:     { fontSize: 13, color: palette.gray400 },

  // Language current chip (shown in row)
  langCurrentChip:  { flexDirection: "row", alignItems: "center", backgroundColor: palette.primary50, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  langCurrentTxt:   { fontSize: 12, color: palette.primary600, fontWeight: "600" },
  rtl:              { textAlign: "right", writingDirection: "rtl" },

  // Inline language panel
  langPanel:        { backgroundColor: palette.gray50, paddingVertical: 8 },
  langOption:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  langOptionActive: { backgroundColor: palette.primary50 },
  langFlag:         { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  langFlagTxt:      { color: "#fff", fontSize: 15, fontWeight: "800" },
  langInfo:         { flex: 1 },
  langNative:       { fontSize: 15, fontWeight: "700", color: palette.gray900 },
  langEng:          { fontSize: 11, color: palette.gray400, marginTop: 1 },
  checkCircle:      { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },

  // Logout
  logoutBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", marginHorizontal: 16, marginTop: 20, backgroundColor: semantic.danger.bg, borderRadius: 16, paddingVertical: 16, gap: 8 },
  logoutTxt:        { fontSize: 14, fontWeight: "700", color: palette.danger500 },
  footerLine:       { fontSize: 11, color: palette.gray400, textAlign: "center", marginTop: 18, lineHeight: 16 },

  // Edit Profile Modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  editModal:        { width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  editHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  editTitle:        { fontSize: 17, fontWeight: "800", color: palette.gray900 },
  editClose:        { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  editField:        { marginBottom: 14 },
  editLabel:        { fontSize: 12, fontWeight: "600", color: palette.gray700, marginBottom: 6 },
  editInput:        { backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 15, color: palette.gray900 },
  saveBtn:          { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveBtnTxt:       { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Password fields (Change Password modal)
  pwInputRow:       { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: 12, paddingHorizontal: 14 },
  pwInput:          { flex: 1, height: 46, fontSize: 15, color: palette.gray900 },
  eyeBtnInline:     { padding: 4 },
  pwChecklist:      { marginTop: 10, gap: 6 },
  pwCheckRow:       { flexDirection: "row", alignItems: "center", gap: 6 },
  pwCheckTxt:       { fontSize: 12, color: palette.gray400 },
  pwCheckTxtDone:   { color: palette.success500, fontWeight: "600" },
  pwMismatchTxt:    { fontSize: 11, color: palette.danger500, marginTop: 6 },

  // Active Sessions modal
  sessionsModal:    { maxHeight: "80%" },
  sessionsList:      { maxHeight: 420 },
  sessionsEmpty:     { alignItems: "center", paddingVertical: 32, gap: 10 },
  sessionsEmptyTxt:  { fontSize: 13, color: palette.gray400 },
  sessionRow:        { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.gray100, gap: 12 },
  sessionIcon:       { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sessionInfo:       { flex: 1 },
  sessionDevice:     { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  sessionMeta:       { fontSize: 11, color: palette.gray400, marginTop: 2 },
  revokeBtn:         { backgroundColor: semantic.danger.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  revokeBtnTxt:      { fontSize: 12, fontWeight: "700", color: palette.danger500 },

  // Delete Account modal
  dangerBox:         { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: semantic.danger.bg, borderWidth: 1, borderColor: palette.danger100, borderRadius: 12, padding: 12, marginBottom: 16 },
  dangerBoxTxt:      { flex: 1, fontSize: 12, color: semantic.danger.text, lineHeight: 18 },
  deleteBtn:         { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
});
