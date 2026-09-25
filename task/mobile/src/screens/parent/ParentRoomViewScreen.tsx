import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppSelector } from "@/store";
import client from "@/api/client";
import { ChatMessage } from "@/api/chat";
import { errorDetail } from "@/api/errorDetail";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { PendingApprovalState } from "@/components/parent/PendingApproval";
import { palette, semantic, accentSolid, radius, spacing, typography } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  roomId:    string;
  roomName:  string;
  childId:   string;
  childName: string;
  onBack:    () => void;
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function formatDateSeparator(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth()    === db.getMonth()    &&
    da.getDate()     === db.getDate()
  );
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  accentSolid.indigo, accentSolid.violet, accentSolid.cyan, accentSolid.emerald,
  accentSolid.amber, accentSolid.rose, accentSolid.fuchsia, accentSolid.teal,
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Date separator ───────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
  return (
    <View style={styles.dateSepRow}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepTxt}>{formatDateSeparator(date)}</Text>
      <View style={styles.dateSepLine} />
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isChild,
}: {
  message: ChatMessage;
  isChild: boolean;
}) {
  const color = avatarColor(message.sender_id);

  return (
    <View style={[styles.bubbleRow, isChild ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      {!isChild && (
        <View style={[styles.bubbleAvatar, { backgroundColor: color }]}>
          <Text style={styles.bubbleAvatarTxt}>{initials(message.sender_name)}</Text>
        </View>
      )}
      <View style={styles.bubbleCol}>
        {!isChild && (
          <Text style={styles.bubbleSender}>{message.sender_name}</Text>
        )}

        {/* Reply preview */}
        {message.reply_to_preview && (
          <View style={[styles.replyPreview, isChild ? styles.replyPreviewChild : styles.replyPreviewOther]}>
            <Text style={styles.replyPreviewSender} numberOfLines={1}>
              {message.reply_to_preview.sender_name}
            </Text>
            <Text style={styles.replyPreviewContent} numberOfLines={2}>
              {message.reply_to_preview.content}
            </Text>
          </View>
        )}

        <View style={[styles.bubble, isChild ? styles.bubbleChild : styles.bubbleOther]}>
          <Text style={[styles.bubbleTxt, isChild ? styles.bubbleTxtChild : styles.bubbleTxtOther]}>
            {message.content}
          </Text>
          <Text style={[styles.bubbleTime, isChild ? styles.bubbleTimeChild : styles.bubbleTimeOther]}>
            {formatBubbleTime(message.created_at)}
          </Text>
        </View>

        {/* Reactions row */}
        {message.reactions && message.reactions.length > 0 && (
          <View style={[styles.reactionsRow, isChild && { justifyContent: "flex-end" }]}>
            {message.reactions.map((r, i) => (
              <View key={i} style={styles.reactionChip}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={styles.reactionCount}>{r.count}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {isChild && (
        <View style={[styles.bubbleAvatar, { backgroundColor: color }]}>
          <Text style={styles.bubbleAvatarTxt}>{initials(message.sender_name)}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ParentRoomViewScreen({
  roomId,
  roomName,
  childId,
  childName,
  onBack,
}: Props) {
  const user = useAppSelector((s) => s.auth.user);
  const { children } = useLinkedChild();
  const link = children.find((c) => c.student_user_id === childId) ?? null;
  const pending = !!link && !link.is_approved;

  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!user || pending) return;
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const { data } = await client.get<ChatMessage[]>(
        `/v1/users/chat/parent/monitor/${childId}/rooms/${roomId}`,
        { params: { parent_user_id: user.id } }
      );
      // Sort oldest-first so inverted FlatList shows newest at bottom
      const sorted = [...data].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(sorted);
    } catch (err: any) {
      setError(errorDetail(err, "Failed to load messages."));
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, [user, childId, roomId, pending]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // ── Render item with optional date separator ──────────────────────────────

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      // In an inverted list the array is reversed, index 0 = newest.
      // We still want separators between day changes.
      const isChild       = item.sender_id === childId;
      const nextMsg       = messages[index - 1]; // index-1 because FlatList renders reversed
      const showSeparator =
        !nextMsg || !isSameDay(item.created_at, nextMsg.created_at);

      return (
        <>
          <MessageBubble message={item} isChild={isChild} />
          {showSeparator && <DateSeparator date={item.created_at} />}
        </>
      );
    },
    [messages, childId]
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={palette.gray700} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>{roomName}</Text>
            <View style={styles.readOnlyBadge}>
              <Text style={styles.readOnlyTxt}>Read Only</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>{childName}'s conversation</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Body */}
      {link && pending ? (
        <PendingApprovalState child={link} />
      ) : loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
          <Text style={styles.loadingTxt}>Loading messages...</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
          <Text style={styles.errorTxt}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchMessages()}>
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[...messages].reverse()} // newest first for inverted rendering
          keyExtractor={(item) => item.message_id}
          renderItem={renderItem}
          inverted
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchMessages(true)}
              colors={[palette.primary600]}
              tintColor={palette.primary600}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={40} color={palette.gray300} />
              <Text style={styles.emptyTxt}>No messages in this conversation yet.</Text>
            </View>
          }
          contentContainerStyle={
            messages.length === 0
              ? styles.emptyListContent
              : styles.listContent
          }
        />
      )}

      {/* Bottom disclaimer bar — replaces input */}
      <View style={styles.disclaimerBar}>
        <Ionicons name="lock-closed-outline" size={15} color={semantic.warning.text} style={{ marginRight: spacing.sm }} />
        <Text style={styles.disclaimerTxt}>
          You are viewing this conversation in read-only mode
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter:   { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, maxWidth: "100%" },
  headerTitle:    { fontSize: typography.h4.fontSize, fontWeight: "700", color: palette.gray900, flexShrink: 1 },
  headerSubtitle: { fontSize: 11, color: palette.gray400, marginTop: 2 },

  readOnlyBadge: {
    backgroundColor: semantic.warning.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  readOnlyTxt: { fontSize: 10, fontWeight: "700", color: palette.warning600 },

  // List
  listContent:      { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  emptyListContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing["3xl"] },

  // Date separator
  dateSepRow:  { flexDirection: "row", alignItems: "center", marginVertical: spacing.md, paddingHorizontal: 4 },
  dateSepLine: { flex: 1, height: 1, backgroundColor: palette.gray200 },
  dateSepTxt:  { fontSize: 11, color: palette.gray400, fontWeight: "600", marginHorizontal: spacing.sm + 2 },

  // Bubble
  bubbleRow:      { flexDirection: "row", alignItems: "flex-end", marginBottom: spacing.sm, gap: spacing.sm },
  bubbleRowLeft:  { justifyContent: "flex-start" },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubbleAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubbleAvatarTxt: { color: "#fff", fontSize: 10, fontWeight: "700" },
  bubbleCol:       { maxWidth: "72%", gap: 4 },
  bubbleSender:    { fontSize: 11, fontWeight: "600", color: palette.gray500, marginBottom: 2, marginLeft: 4 },

  bubble: {
    borderRadius: radius.xl - 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    flexWrap: "wrap",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  bubbleChild: {
    backgroundColor: palette.primary600,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
  },
  bubbleTxt:      { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  bubbleTxtChild: { color: "#fff" },
  bubbleTxtOther: { color: palette.gray900 },
  bubbleTime:      { fontSize: 10, alignSelf: "flex-end", flexShrink: 0 },
  bubbleTimeChild: { color: "rgba(255,255,255,0.6)" },
  bubbleTimeOther: { color: palette.gray400 },

  // Reply preview inside bubble
  replyPreview: {
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: 2,
  },
  replyPreviewChild: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderLeftColor: "rgba(255,255,255,0.5)",
  },
  replyPreviewOther: {
    backgroundColor: palette.gray100,
    borderLeftColor: palette.primary600,
  },
  replyPreviewSender:  { fontSize: 11, fontWeight: "700", color: palette.primary600, marginBottom: 2 },
  replyPreviewContent: { fontSize: 11, color: palette.gray500 },

  // Reactions
  reactionsRow: { flexDirection: "row", gap: 4, marginTop: 2, flexWrap: "wrap" },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.gray100,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 11, color: palette.gray500, fontWeight: "600" },

  // Disclaimer bottom bar
  disclaimerBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.warning.bg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderTopWidth: 1,
    borderTopColor: semantic.warning.border,
  },
  disclaimerTxt: {
    flex: 1,
    fontSize: 13,
    color: semantic.warning.text,
    fontWeight: "500",
  },

  // States
  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingTxt:    { fontSize: 14, color: palette.gray500 },
  errorTxt:      { fontSize: 14, color: palette.danger500, textAlign: "center", paddingHorizontal: spacing["3xl"] },
  retryBtn: {
    backgroundColor: palette.primary50,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  retryBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },
  emptyState:  { alignItems: "center", gap: spacing.sm + 2 },
  emptyTxt:    { fontSize: 14, color: palette.gray400, textAlign: "center" },
});
