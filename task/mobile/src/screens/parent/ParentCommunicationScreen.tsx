import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { announcementApi } from "@/api/announcement";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { PendingApprovalState, PendingBadge } from "@/components/parent/PendingApproval";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

// Mirrors ParentCommunicationPage.tsx's localStorage-backed read-tracking —
// without persisting this, every screen remount / app restart reset all
// announcements to "unread" (including the unread badge count), since the
// old version only kept readIds in component state.
const READ_IDS_STORAGE_KEY = "parent_read_announcements";

// ─── Types ────────────────────────────────────────────────────────────────────
// Shape returned by GET /v1/notifications/announcements (active_only=true)

interface Announcement {
  id:         string;
  type?:      string;
  title:      string;
  body?:      string;
  message?:   string;
  created_at?: string;
  time?:      string;
  read?:      boolean;
}

type TabKey = "announcements" | "monitor";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "announcements", label: "Announcements", icon: "notifications-outline" },
  { key: "monitor",       label: "Monitor Chat",   icon: "shield-checkmark-outline" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeIcon(type?: string): keyof typeof Ionicons.glyphMap {
  if (type === "exam")   return "calendar-outline";
  if (type === "course") return "book-outline";
  if (type === "result") return "trophy-outline";
  return "megaphone-outline";
}

// One-off: this is a 4-way category-tag palette (exam/course/result/other),
// not a status/semantic signal, so it intentionally sits outside the
// success/warning/danger/info semantic set. Kept as a small local constant
// (not hardcoded per-callsite) using neutral/semantic-adjacent tokens where
// they line up, plus one genuinely decorative category hue (violet-ish)
// that has no equivalent in the strict palette — flagged here rather than
// silently reused as a "brand" color.
const TYPE_COLORS: Record<string, string> = {
  exam:   semantic.danger.solid,
  course: semantic.info.solid,
  result: semantic.warning.solid,
};
const TYPE_COLOR_DEFAULT = "#8B5CF6"; // category-tag only, not a brand/gradient use

function typeColor(type?: string): string {
  return TYPE_COLORS[type ?? ""] ?? TYPE_COLOR_DEFAULT;
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000)      return "just now";
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Announcements tab ────────────────────────────────────────────────────────

function AnnouncementsTab({
  items,
  loading,
  isError,
  onRetry,
  expandedId,
  onToggle,
  readIds,
}: {
  items:      Announcement[];
  loading:    boolean;
  isError:    boolean;
  onRetry:    () => void;
  expandedId: string | null;
  onToggle:   (id: string) => void;
  readIds:    Set<string>;
}) {
  if (loading) {
    return (
      <View style={s.centeredState}>
        <ActivityIndicator size="large" color={palette.primary600} />
        <Text style={s.loadingTxt}>Loading announcements...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.centeredState}>
        <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
        <Text style={s.errorTxt}>Couldn't load announcements.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={onRetry}>
          <Text style={s.retryBtnTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={s.centeredState}>
        <View style={s.emptyIconBox}>
          <Ionicons name="notifications-outline" size={36} color={palette.gray400} />
        </View>
        <Text style={s.emptyTitle}>No Announcements</Text>
        <Text style={s.emptyBody}>School and platform updates will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item) => {
        const isRead = item.read || readIds.has(item.id);
        const isExpanded = expandedId === item.id;
        const body = item.body ?? item.message ?? "";
        const color = typeColor(item.type);
        return (
          <View key={item.id} style={[s.card, s.announceCard, !isRead && s.announceCardUnread]}>
            <TouchableOpacity
              style={s.announceRow}
              onPress={() => onToggle(item.id)}
              activeOpacity={0.75}
            >
              <View style={[s.announceIconBox, { backgroundColor: color + "1A" }]}>
                <Ionicons name={typeIcon(item.type)} size={18} color={color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.announceTitleRow}>
                  <Text style={[s.announceTitle, !isRead && s.announceTitleUnread]} numberOfLines={isExpanded ? undefined : 2}>
                    {item.title}
                  </Text>
                  {!isRead && <View style={s.unreadDot} />}
                </View>
                <Text style={s.announceTime}>{formatTime(item.created_at ?? item.time)}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={palette.gray400}
                style={{ transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}
              />
            </TouchableOpacity>
            {isExpanded && !!body && (
              <View style={s.announceBody}>
                <Text style={s.announceBodyTxt}>{body}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Monitor Chat tab (deep-links to the existing Monitor flow) ───────────────

function MonitorTab({ onOpenMonitor }: { onOpenMonitor: () => void }) {
  const { children, child, selectedChildId, selectChild, isApproved } = useLinkedChild();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={s.warnBanner}>
        <Ionicons name="eye-outline" size={16} color={semantic.warning.text} style={{ marginRight: spacing.sm }} />
        <Text style={s.warnBannerTxt}>
          You can view your child's conversations in read-only mode from the Monitor tab.
        </Text>
      </View>

      {children.length > 1 && (
        <View style={s.childPickerRow}>
          {children.map((c) => {
            const active = c.student_user_id === selectedChildId;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => selectChild(c.student_user_id)}
                style={[s.childChip, active && s.childChipActive]}
              >
                <Text style={[s.childChipTxt, active && s.childChipTxtActive]}>
                  {c.student_name ?? "Student"}
                </Text>
                {!c.is_approved && <PendingBadge style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {child && !isApproved ? (
        <View style={s.card}>
          <PendingApprovalState child={child} />
        </View>
      ) : (
      <View style={[s.card, { alignItems: "center", paddingVertical: spacing["3xl"] - 4, gap: spacing.sm + 2 }]}>
        <View style={s.emptyIconBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={32} color={palette.primary600} />
        </View>
        <Text style={s.portalTitle}>Monitor your child's chats</Text>
        <Text style={[s.portalBody, { marginBottom: 4 }]}>
          Review conversations your child has had, in a secure read-only view.
        </Text>
        <TouchableOpacity style={s.openMonitorBtn} onPress={onOpenMonitor} activeOpacity={0.85}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
          <Text style={s.openMonitorBtnTxt}>Open Monitor</Text>
        </TouchableOpacity>
      </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ParentCommunicationScreen() {
  const navigation = useNavigation<any>();

  const [tab, setTab] = useState<TabKey>("announcements");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(READ_IDS_STORAGE_KEY)
      .then((raw) => {
        if (raw) setReadIds(new Set(JSON.parse(raw)));
      })
      .catch(() => { /* ignore — falls back to empty (all-unread) */ });
  }, []);

  const {
    data: announcementsRaw,
    isLoading: announcementsLoading,
    isError: announcementsError,
    refetch: refetchAnnouncements,
  } = useQuery({
    queryKey: ["parent-announcements"],
    queryFn: () => announcementApi.list(true).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const announcements: Announcement[] = useMemo(() => {
    const raw = announcementsRaw as any;
    return Array.isArray(raw) ? raw : raw?.data ?? raw?.announcements ?? [];
  }, [announcementsRaw]);

  const unreadCount = announcements.filter((a) => !(a.read || readIds.has(a.id))).length;

  const toggleAnnouncement = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify([...next])).catch(() => { /* ignore */ });
      return next;
    });
  };

  const handleOpenMonitor = () => {
    navigation.navigate("Monitor");
  };

  return (
    <View style={s.safe}>
      {/* Header — solid indigo fill (was indigo→violet gradient) */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Communication Center</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={s.headerSub}>School announcements, teacher messages & exam updates</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map(({ key, label, icon }) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={[s.tabBtn, active && s.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Ionicons name={icon} size={14} color={active ? palette.primary600 : palette.gray400} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1}>{label}</Text>
              {key === "announcements" && unreadCount > 0 && (
                <View style={s.tabBadge}>
                  <Text style={s.tabBadgeTxt}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {tab === "announcements" && (
          <AnnouncementsTab
            items={announcements}
            loading={announcementsLoading}
            isError={announcementsError}
            onRetry={() => refetchAnnouncements()}
            expandedId={expandedId}
            onToggle={toggleAnnouncement}
            readIds={readIds}
          />
        )}
        {tab === "monitor" && <MonitorTab onOpenMonitor={handleOpenMonitor} />}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: palette.gray50 },
  container: { flex: 1 },
  content:   { padding: spacing.lg, paddingBottom: spacing["3xl"] },

  childPickerRow:     { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  childChip:          { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: palette.gray100 },
  childChipActive:    { backgroundColor: palette.primary50 },
  childChipTxt:       { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  childChipTxtActive: { color: palette.primary600 },

  // Header — solid indigo, no gradient
  header:       { backgroundColor: palette.primary600, paddingTop: 56, paddingBottom: spacing.xl - 2, paddingHorizontal: spacing["2xl"] - 4 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:  { color: "#fff", fontSize: typography.h3.fontSize, fontWeight: "800", letterSpacing: -0.3 },
  headerSub:    { color: "rgba(255,255,255,0.75)", fontSize: typography.bodySm.fontSize, marginTop: spacing.sm + 2, textAlign: "center" },

  // Tabs
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive:  { borderBottomColor: palette.primary600 },
  tabLabel:      { fontSize: 11, fontWeight: "600", color: palette.gray400 },
  tabLabelActive:{ color: palette.primary600 },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.danger500,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  tabBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // Shared card
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.gray100,
    ...cardShadow,
  },

  // Announcements
  announceCard:       { padding: 0, overflow: "hidden", borderWidth: 1, borderColor: palette.gray100 },
  announceCardUnread: { borderColor: palette.primary100, backgroundColor: palette.primary50 },
  announceRow:         { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md + 2 },
  announceIconBox:      { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  announceTitleRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
  announceTitle:        { flex: 1, fontSize: 13, fontWeight: "600", color: palette.gray700 },
  announceTitleUnread:  { color: palette.gray900, fontWeight: "700" },
  announceTime:         { fontSize: 11, color: palette.gray400, marginTop: 3 },
  unreadDot:            { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.primary600 },
  announceBody:         { paddingHorizontal: spacing.md + 2, paddingBottom: spacing.md + 2, paddingLeft: 62 },
  announceBodyTxt:      { fontSize: 13, color: palette.gray600, lineHeight: 19 },

  // Info / warning banners
  warnBanner:    { flexDirection: "row", alignItems: "flex-start", backgroundColor: semantic.warning.bg, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: semantic.warning.border },
  warnBannerTxt: { flex: 1, fontSize: 12, color: semantic.warning.text, lineHeight: 17 },

  portalTitle: { fontSize: 13, fontWeight: "700", color: palette.gray500, marginTop: 4 },
  portalBody:  { fontSize: 11, color: palette.gray400, textAlign: "center", lineHeight: 16 },

  openMonitorBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: palette.primary600,
    borderRadius: radius.md,
    paddingHorizontal: spacing["2xl"] - 4,
    minHeight: 44,
    justifyContent: "center",
  },
  openMonitorBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // States
  centeredState: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"], paddingTop: 60, gap: spacing.md },
  emptyIconBox:  { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  emptyTitle:    { fontSize: 15, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:     { fontSize: 13, color: palette.gray400, textAlign: "center", lineHeight: 19 },
  loadingTxt:    { fontSize: 14, color: palette.gray500, marginTop: spacing.sm },
  errorTxt:      { fontSize: 14, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn:      { marginTop: 4, backgroundColor: palette.primary50, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.sm + 2, borderRadius: radius.md },
  retryBtnTxt:   { fontSize: 13, fontWeight: "700", color: palette.primary600 },
});
