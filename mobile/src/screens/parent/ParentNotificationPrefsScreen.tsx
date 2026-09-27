import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { notificationApi } from "@/api/notification";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/i18n/translations";
import { palette, accentSolid, cardShadow, radius, spacing, typography } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = "in_app" | "email" | "whatsapp";

interface EventGroup {
  key: string;
  label: string;
  description: string;
  icon: string;
  tint: string;
  labelKey?: TranslationKey;
  descKey?: TranslationKey;
}

// Parent-facing events — all about the CHILD's activity, unlike the student
// NotificationPreferencesScreen's self-directed set. Same backend field
// names (in_app_*/email_*/whatsapp_* per event, shared preference row per
// user) — mirrors ParentNotificationPrefsPage.tsx on web, which had no
// mobile counterpart until now (it routed to the generic student screen).
const EVENT_GROUPS: EventGroup[] = [
  {
    key: "new_video",
    label: "New Videos Published",
    description: "When new lesson videos are published for your child's class",
    icon: "play-circle-outline",
    tint: accentSolid.cyan,
  },
  {
    key: "quiz_result",
    label: "Quiz Results",
    description: "When your child completes a quiz",
    icon: "checkmark-circle-outline",
    tint: accentSolid.emerald,
  },
  {
    key: "battle_invite",
    label: "Battle Invites",
    description: "When your child receives a quiz battle challenge",
    icon: "flash-outline",
    tint: accentSolid.rose,
  },
  {
    key: "streak_reminder",
    label: "Streak Reminders",
    description: "When the daily streak is at risk",
    icon: "flame-outline",
    tint: accentSolid.amber,
  },
  {
    key: "badge_unlocked",
    label: "Badges Unlocked",
    description: "When your child earns a new achievement badge",
    icon: "ribbon-outline",
    tint: palette.primary600,
  },
  {
    key: "promotional",
    label: "Promotional",
    description: "Offers, new course announcements, and platform updates",
    icon: "megaphone-outline",
    tint: palette.primary600,
  },
  {
    key: "parent_link",
    label: "Link requests & approvals",
    description: "When a link request is approved, declined or removed",
    icon: "link-outline",
    tint: palette.primary600,
    labelKey: "prefParentLink",
    descKey: "prefParentLinkDesc",
  },
  {
    key: "purchase_approval",
    label: "Purchase approvals",
    description: "When your child asks you to approve a plan purchase",
    icon: "card-outline",
    tint: accentSolid.amber,
    labelKey: "prefPurchaseApproval",
    descKey: "prefPurchaseApprovalDesc",
  },
  {
    key: "child_weekly_summary",
    label: "Weekly child summary",
    description: "A weekly digest of your child's study activity",
    icon: "calendar-outline",
    tint: accentSolid.emerald,
    labelKey: "prefChildWeeklySummary",
    descKey: "prefChildWeeklySummaryDesc",
  },
  {
    key: "meeting_update",
    label: "Meeting updates",
    description: "When a meeting request is confirmed or declined",
    icon: "people-outline",
    tint: accentSolid.teal,
    labelKey: "prefMeetingUpdate",
    descKey: "prefMeetingUpdateDesc",
  },
];

const CHANNELS: { key: Channel; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "in_app", label: "In-App", icon: "notifications-outline" },
  { key: "email", label: "Email", icon: "mail-outline" },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
];

type Prefs = Record<string, boolean>;

function fieldKey(channel: Channel, eventKey: string) {
  return `${channel}_${eventKey}`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ParentNotificationPrefsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const user = useAppSelector((s) => s.auth.user);
  const userId = user?.id ?? "";

  const [prefs, setPrefs] = useState<Prefs>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const {
    data: serverPrefs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["notification-preferences", userId],
    queryFn: () => notificationApi.getPreferences(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (serverPrefs) setPrefs(serverPrefs);
  }, [serverPrefs]);

  const handleToggle = async (channel: Channel, eventKey: string, value: boolean) => {
    if (!userId) return;
    const key = fieldKey(channel, eventKey);
    const previous = prefs[key];

    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSavingKey(key);

    try {
      const { data } = await notificationApi.updatePreferences(userId, { [key]: value });
      if (data) {
        setPrefs((prev) => ({ ...prev, ...data }));
      }
      queryClient.setQueryData(["notification-preferences", userId], (old: Prefs | undefined) => ({
        ...(old ?? {}),
        [key]: value,
      }));
    } catch (err: any) {
      setPrefs((prev) => ({ ...prev, [key]: previous }));
      Toast.show({
        type: "error",
        text1: "Couldn't save preference",
        text2: err?.response?.data?.detail ?? "Please check your connection and try again.",
      });
    } finally {
      setSavingKey(null);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
          <Text style={styles.loadingTxt}>Loading your preferences...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
          <Text style={styles.errorTxt}>Failed to load notification preferences.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!userId) {
      return (
        <View style={styles.centeredState}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="person-outline" size={40} color={palette.gray400} />
          </View>
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={styles.emptyBody}>Log in to manage your notification preferences.</Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Column legend */}
        <View style={styles.legendRow}>
          <View style={{ flex: 1 }} />
          {CHANNELS.map((ch) => (
            <View key={ch.key} style={styles.legendCol}>
              <Ionicons name={ch.icon} size={16} color={palette.gray500} />
              <Text style={styles.legendTxt} numberOfLines={1} ellipsizeMode="tail">
                {ch.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          {EVENT_GROUPS.map((ev, idx) => (
            <View
              key={ev.key}
              style={[styles.eventRow, idx === EVENT_GROUPS.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.eventInfo}>
                <View style={[styles.eventIcon, { backgroundColor: ev.tint }]}>
                  <Ionicons name={ev.icon as any} size={17} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventLabel} numberOfLines={1} ellipsizeMode="tail">
                    {ev.labelKey ? t(ev.labelKey) : ev.label}
                  </Text>
                  <Text style={styles.eventDesc} numberOfLines={2} ellipsizeMode="tail">
                    {ev.descKey ? t(ev.descKey) : ev.description}
                  </Text>
                </View>
              </View>

              <View style={styles.channelRow}>
                {CHANNELS.map((ch) => {
                  const key = fieldKey(ch.key, ev.key);
                  const value = !!prefs[key];
                  const saving = savingKey === key;
                  return (
                    <View key={ch.key} style={styles.channelCol}>
                      {saving ? (
                        <ActivityIndicator size="small" color={palette.primary600} />
                      ) : (
                        <Switch
                          value={value}
                          onValueChange={(v) => handleToggle(ch.key, ev.key, v)}
                          trackColor={{ false: palette.gray200, true: palette.primary600 }}
                          thumbColor="#fff"
                          disabled={savingKey !== null}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footNote}>
          <Ionicons name="information-circle-outline" size={14} color={palette.gray400} />
          <Text style={styles.footNoteTxt}>
            Changes save automatically. WhatsApp alerts require a verified phone number on your account.
          </Text>
        </View>
      </ScrollView>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notification Preferences</Text>
          <Text style={styles.headerSubtitle}>Stay updated on your child's activity</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {renderContent()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: palette.primary600,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: typography.h4.fontSize, fontFamily: typography.h4.fontFamily, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing["4xl"] },

  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm, paddingHorizontal: 4 },
  legendCol: { width: 50, alignItems: "center", gap: 3 },
  legendTxt: { fontSize: 10, fontWeight: "700", color: palette.gray500, textTransform: "uppercase" },

  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.gray100,
    overflow: "hidden",
    ...cardShadow,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  eventInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 8 },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventLabel: { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  eventDesc: { fontSize: 11, color: palette.gray400, marginTop: 2, lineHeight: 14 },

  channelRow: { flexDirection: "row", flexShrink: 0 },
  channelCol: { width: 50, alignItems: "center", justifyContent: "center" },

  footNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  footNoteTxt: { flex: 1, fontSize: 11, color: palette.gray400, lineHeight: 15 },

  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody: { fontSize: 13, color: palette.gray400, textAlign: "center", lineHeight: 19 },
  loadingTxt: { fontSize: 14, color: palette.gray500, marginTop: 8 },
  errorTxt: { fontSize: 14, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 4,
    backgroundColor: palette.primary50,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  retryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },
});
