import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { notificationApi } from "@/api/notification";
import { palette, accentSolid, radius, spacing, typography } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  type: string;          // delivery channel: email | whatsapp | push | in_app
  title: string;
  body?: string;
  message?: string;
  template?: string | null;
  is_read: boolean;
  created_at: string;
}


// ─── Icon mapping ─────────────────────────────────────────────────────────────
// The `type` field on a notification is its delivery channel (email/whatsapp/push/in_app),
// so we first try to infer a more specific icon from the title/template text, then fall
// back to a channel-based icon.

const TITLE_ICON_MAP: { match: string; icon: string; color: string }[] = [
  { match: "streak",     icon: "flame",             color: accentSolid.amber },
  { match: "badge",      icon: "ribbon",             color: palette.warning500 },
  { match: "achievement",icon: "trophy",             color: palette.warning500 },
  { match: "quiz",       icon: "checkmark-circle",   color: palette.success600 },
  { match: "battle",     icon: "flash",              color: palette.danger500 },
  { match: "video",      icon: "play-circle",        color: palette.primary500 },
  { match: "message",    icon: "chatbubble-ellipses",color: accentSolid.cyan },
  { match: "reminder",   icon: "alarm",              color: palette.warning600 },
  { match: "warning",    icon: "alert-circle",       color: palette.danger600 },
  { match: "welcome",    icon: "hand-left",          color: palette.primary600 },
];

const CHANNEL_ICON_MAP: Record<string, { icon: string; color: string }> = {
  email:    { icon: "mail",              color: accentSolid.cyan },
  whatsapp: { icon: "logo-whatsapp",     color: palette.success600 },
  push:     { icon: "notifications",     color: palette.primary600 },
  in_app:   { icon: "notifications",     color: palette.primary600 },
};

function iconFor(notif: NotificationItem): { icon: string; color: string } {
  const haystack = `${notif.title ?? ""} ${notif.template ?? ""}`.toLowerCase();
  const hit = TITLE_ICON_MAP.find(m => haystack.includes(m.match));
  if (hit) return { icon: hit.icon, color: hit.color };
  return CHANNEL_ICON_MAP[notif.type?.toLowerCase()] ?? { icon: "notifications", color: palette.primary600 };
}

// ─── Relative time ────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return "just now";
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onPress,
  onLongPress,
  selectionMode,
  selected,
}: {
  item: NotificationItem;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  selected: boolean;
}) {
  const { icon, color } = iconFor(item);
  const body = item.message ?? item.body ?? "";
  const unread = !item.is_read;

  return (
    <TouchableOpacity
      style={[styles.row, unread && styles.rowUnread, selected && styles.rowSelected]}
      activeOpacity={0.75}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {unread && !selectionMode && <View style={styles.accentBar} />}

      {selectionMode && (
        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
          {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      )}

      <View style={[styles.iconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTopLine}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {unread && <View style={styles.unreadDot} />}
        </View>
        {!!body && (
          <Text style={styles.rowMessage} numberOfLines={2}>{body}</Text>
        )}
        <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const user = useAppSelector(s => s.auth.user);
  const userId = user?.id ?? user?.user_id ?? "";

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => notificationApi.getNotifications(userId, 50).then(r => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  });


  const notifications: NotificationItem[] = useMemo(
    () => data?.notifications ?? data ?? [],
    [data]
  );
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllMut = useMutation({
    mutationFn: () => notificationApi.markAllRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Couldn't mark all as read", text2: "Please try again." });
    },
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => notificationApi.markBulkRead([id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });

  const markSelectedMut = useMutation({
    mutationFn: (ids: string[]) => notificationApi.markBulkRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
      setSelected(new Set());
      setSelectionMode(false);
    },
    onError: () => {
      Toast.show({ type: "error", text1: "Couldn't mark selected as read", text2: "Please try again." });
    },
  });

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const enterSelectionMode = (id: string) => {
    setSelectionMode(true);
    setSelected(new Set([id]));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const handleItemPress = (item: NotificationItem) => {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    if (!item.is_read) markOneMut.mutate(item.id);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (selectionMode ? exitSelectionMode() : navigation.goBack())}
          >
            <Ionicons name={selectionMode ? "close" : "arrow-back"} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>
              {selectionMode ? `${selected.size} selected` : "Notifications"}
            </Text>
            {!selectionMode && unreadCount > 0 && (
              <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
            )}
          </View>
          {notifications.length > 0 ? (
            <TouchableOpacity
              style={styles.selectToggleBtn}
              onPress={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            >
              <Text style={styles.selectToggleTxt}>{selectionMode ? "Cancel" : "Select"}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {!selectionMode && unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            activeOpacity={0.8}
            onPress={() => markAllMut.mutate()}
            disabled={markAllMut.isPending}
          >
            {markAllMut.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.markAllTxt}>Mark all read</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              onPress={() => handleItemPress(item)}
              onLongPress={() => (selectionMode ? toggleSelected(item.id) : enterSelectionMode(item.id))}
              selectionMode={selectionMode}
              selected={selected.has(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={[
            notifications.length === 0 ? styles.emptyContainer : styles.listContent,
            selectionMode && selected.size > 0 ? styles.listContentWithBar : null,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={palette.primary600}
              colors={[palette.primary600]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="notifications-off-outline" size={40} color={palette.gray400} />
              </View>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyBody}>
                We'll let you know when something happens — badges, streaks, messages and more.
              </Text>
            </View>
          }
        />
      )}

      {/* Bulk action bar */}
      {selectionMode && selected.size > 0 && (
        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={styles.bulkBtn}
            activeOpacity={0.85}
            onPress={() => markSelectedMut.mutate(Array.from(selected))}
            disabled={markSelectedMut.isPending}
          >
            {markSelectedMut.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.bulkBtnTxt}>Mark {selected.size} read</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },

  // Header
  header:           { paddingTop: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, backgroundColor: palette.primary600 },
  headerTop:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:          { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitleWrap:  { alignItems: "center" },
  headerTitle:      { fontSize: typography.h3.fontSize, fontFamily: typography.h3.fontFamily, fontWeight: "800", color: "#fff" },
  headerSubtitle:   { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  markAllBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "flex-start", marginTop: spacing.md, minHeight: 36, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  markAllTxt:       { color: "#fff", fontSize: 12, fontWeight: "700" },
  selectToggleBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  selectToggleTxt:  { color: "#fff", fontSize: 12, fontWeight: "700" },

  centered:         { flex: 1, alignItems: "center", justifyContent: "center" },

  // List
  listContent:        { paddingBottom: spacing["2xl"] },
  listContentWithBar: { paddingBottom: 88 },
  emptyContainer:   { flex: 1 },
  separator:        { height: 1, backgroundColor: palette.gray100, marginLeft: 68 },

  // Row
  row:              { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#fff", paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 44, position: "relative" },
  rowUnread:        { backgroundColor: palette.primary50 },
  rowSelected:      { backgroundColor: palette.primary100 },
  accentBar:        { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: palette.primary600 },
  checkbox:         { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.primary200, alignItems: "center", justifyContent: "center", marginRight: spacing.md, flexShrink: 0 },
  checkboxChecked:  { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  iconWrap:         { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: spacing.md, flexShrink: 0 },
  rowBody:          { flex: 1, minWidth: 0 },
  rowTopLine:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle:         { flex: 1, fontSize: typography.bodyMedium.fontSize, fontWeight: "600", color: palette.gray500, marginRight: spacing.sm },
  rowTitleUnread:   { color: palette.gray900, fontWeight: "700" },
  unreadDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary600, flexShrink: 0 },
  rowMessage:       { fontSize: typography.bodyMedium.fontSize, color: palette.gray500, marginTop: 3, lineHeight: 18 },
  rowTime:          { fontSize: 11, color: palette.gray400, marginTop: spacing.sm },

  // Bulk action bar
  bulkBar:          { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: palette.gray100, shadowColor: "#000", shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bulkBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: palette.primary600, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: 44 },
  bulkBtnTxt:       { color: "#fff", fontSize: typography.h4.fontSize, fontWeight: "700" },

  // Empty state
  emptyState:       { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"] },
  emptyIconBox:     { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  emptyTitle:       { fontSize: typography.h4.fontSize, fontFamily: typography.h4.fontFamily, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:        { fontSize: typography.bodyMedium.fontSize, color: palette.gray400, textAlign: "center", lineHeight: 19, marginTop: spacing.sm },
});
